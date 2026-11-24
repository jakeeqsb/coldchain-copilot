"""The execution engine: evaluate every applicable clause for one shipment.

The engine reads names and connections from the ontology and runs the
functions ``registry.py`` maps them to. For one shipment it takes six steps:

1. Read the shipment through its object type: the ontology says which
   collection holds it, which field is its key, and which fields bound its
   period (departure to delivery, or to now while in transit).
2. Select applicable clauses: its contract version plus contract-free
   recommendations for its cargo class and ancestors (``ontology.py``).
3. For every event type those clauses wait on, look up the event type's
   ``detector`` and run it over the shipment period. Also check whether the
   fields it requires were collected at all.
4. Compare each clause's conditions with the detected measures (``rules.py``).
5. For each triggered clause, follow ``rel:references`` with the link type's
   ``traverse`` function to list the clauses that build on it.
6. For each triggered clause, run its action type's ``handler`` to produce a
   briefing item.

Nothing is stored; the result is returned to the caller (a tool, the agent).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import db, detection, ontology, registry, rules
from .errors import ErrorCode, ToolError

Doc = dict[str, Any]

REFERENCES = "rel:references"


def evaluate_shipment(shipment_id: str, now: datetime | None = None) -> Doc:
    """Runs the six steps for one shipment and returns every clause's result.

    Args:
        shipment_id: For example ``"SHP-102"``.
        now: End of the period for a shipment still in transit. Defaults to
            the current time; tests pass a fixed value.

    Returns:
        ``shipmentId``, ``contractRef``, ``period`` (``start``/``end``),
        ``results`` (one per applicable clause, from ``rules.py``, each with a
        ``follows`` list of dependent clause ids when triggered), and
        ``actions`` (one briefing item per triggered clause).

    Raises:
        ToolError: ``NOT_FOUND`` if the shipment does not exist.
    """
    # 1. Object and period
    shipment, start, end = load_object("Shipment", shipment_id, now)
    scope = {"meta.shipmentId": shipment_id}

    # 2. Applicable clauses, and the ontology entries they use
    clauses = ontology.applicable_clauses(shipment)
    event_ids = {c["trigger"]["eventType"] for c in clauses if "eventType" in c["trigger"]}
    action_ids = {f"action:{c['action']['type']}" for c in clauses}
    defs = ontology.ontology_docs(event_ids | action_ids | {REFERENCES})

    # 3. Detect events through each event type's detector
    events_by_type: dict[str, list[Doc]] = {}
    collected_by_type: dict[str, bool] = {}
    for event_id in sorted(event_ids):
        event_type = defs[event_id]
        detector = registry.DETECTORS[event_type["detector"]]
        events_by_type[event_id] = detector(scope, start, end)
        collected_by_type[event_id] = all(
            detection.field_collected(field, scope, start, end) for field in event_type["requiresFields"]
        )

    # 4. Compare conditions
    results = rules.evaluate_clauses(clauses, events_by_type, collected_by_type)

    # 5. Follow references from triggered clauses
    traverse = registry.TRAVERSERS[defs[REFERENCES]["traverse"]]
    for result in results:
        if result["status"] == "triggered":
            result["follows"] = [c["clauseId"] for c in traverse(result["clauseId"])]

    # 6. Run each triggered clause's action handler
    actions = []
    for result in results:
        if result["status"] == "triggered":
            handler = registry.ACTIONS[defs[f"action:{result['action']['type']}"]["handler"]]
            actions.append(handler(result))

    return {
        "shipmentId": shipment_id,
        "contractRef": shipment["contractRef"],
        "period": {"start": start, "end": end},
        "results": results,
        "actions": actions,
    }


def load_object(object_type: str, object_id: str, now: datetime | None = None) -> tuple[Doc, datetime, datetime]:
    """Reads one object and its period, as its object type defines them.

    The object type document says where the object lives and what bounds
    its period, so the code names no collection or field::

        {"_id": "Shipment", "collection": "shipments", "key": "shipmentId",
         "period": {"start": "departedAt", "end": "deliveredAt"}, ...}

    Used by the engine (step 1) and by tools that scope a query to a
    shipment, so both use the same period.

    Args:
        object_type: An object type id, for example ``"Shipment"``. It must
            define ``collection``, ``key``, and ``period``.
        object_id: The value of the key field, for example ``"SHP-102"``.
        now: End of the period while its end field is empty. Defaults to the
            current time; tests pass a fixed value.

    Returns:
        ``(document, start, end)``; the document without ``_id``.

    Raises:
        ToolError: ``NOT_FOUND`` if no object has that key.
    """
    definition = ontology.ontology_docs({object_type})[object_type]
    document = db.collection(definition["collection"]).find_one({definition["key"]: object_id}, {"_id": 0})
    if document is None:
        raise ToolError(ErrorCode.NOT_FOUND, f"No {object_type} with {definition['key']} {object_id}.")
    return document, *object_period(document, definition["period"], now)


def object_period(document: Doc, period: Doc, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Returns an object's period from the fields its object type names.

    An empty end field means the period is still open (a shipment in
    transit), so it ends now. The period is not capped by
    ``MAX_WINDOW_HOURS``: cumulative measures such as ``cumulativeMinutes``
    are defined over the whole shipment.

    Args:
        document: The object, e.g. a shipment.
        period: ``{"start": field, "end": field}`` from the object type.
        now: End of an open period. Defaults to the current time.
    """
    end = document.get(period["end"]) or now or datetime.now(timezone.utc)
    return document[period["start"]], end