"""The execution engine: evaluate every applicable clause for one shipment.

The engine reads names and connections from the ontology and runs the
functions ``registry.py`` maps them to. For one shipment it takes six steps:

1. Read the shipment through its object type: the ontology says which
   collection holds it, which field is its key, and which fields bound its
   period (departure to delivery, or to now while in transit).
2. Select applicable clauses: its contract version plus contract-free
   recommendations for its cargo class and ancestors (``ontology.py``).
3. For every event type those clauses wait on, look up the event type's
   ``detector`` and run it over the shipment period, once. An event type
   that lists ``causes`` gets the cause detectors run too, and each event
   is tagged with the cause it overlaps (:func:`detect_events`). Also check
   whether the fields each event type requires were collected at all.
4. Compare each clause's conditions with the detected measures (``rules.py``).
   Each result gets the clause's ``source`` (and its ``text`` when the
   answer will quote it), joined from ``knowledge`` in step 2.
5. For each triggered clause, follow ``rel:references`` with the link type's
   ``traverse`` function to list the clauses that build on it.
6. For each triggered clause, run its action type's ``handler`` to produce a
   briefing item.

Nothing is stored; the result is returned to the caller (a tool, the agent).
The result also carries a ``trace`` of the six steps (:func:`trace_step`),
for a front end to show what each step read. The agent keeps it out of the
model's input.
"""

from __future__ import annotations

import time
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
        ``results`` (one per applicable clause, from ``rules.py``, each with
        ``source``, ``text`` when quoted (:func:`attach_sources`), and a
        ``follows`` list of dependent clause ids when triggered),
        ``actions`` (one briefing item per triggered clause), and ``trace``
        (one :func:`trace_step` per step).

    Raises:
        ToolError: ``NOT_FOUND`` if the shipment does not exist.
    """
    trace: list[Doc] = []

    # 1. Object and period
    started = time.perf_counter()
    shipment, start, end = load_object("Shipment", shipment_id, now)
    scope = {"meta.shipmentId": shipment_id}
    trace.append(trace_step("object", [db.ONTOLOGY, db.SHIPMENTS], ["find"], 1, started))

    # 2. Applicable clauses, and the ontology entries they use
    started = time.perf_counter()
    clauses = ontology.applicable_clauses(shipment)
    event_ids = {c["trigger"]["eventType"] for c in clauses if "eventType" in c["trigger"]}
    action_ids = {f"action:{c['action']['type']}" for c in clauses}
    defs = ontology.ontology_docs(event_ids | action_ids | {REFERENCES})
    trace.append(trace_step("clauses", [db.ONTOLOGY, db.CLAUSES, db.KNOWLEDGE], ["$lookup"], len(clauses), started))

    # 3. Detect events through each event type's detector, with causes attached
    started = time.perf_counter()
    events_by_type = detect_events(event_ids, scope, start, end)
    collected_by_type = {
        event_id: all(detection.field_collected(field, scope, start, end) for field in defs[event_id]["requiresFields"])
        for event_id in event_ids
    }
    events = sum(len(found) for found in events_by_type.values())
    trace.append(trace_step("events", [db.READINGS], ["Time Series", "$setWindowFields"], events, started))

    # 4. Compare conditions, and attach each clause's source
    started = time.perf_counter()
    results = rules.evaluate_clauses(clauses, events_by_type, collected_by_type)
    attach_sources(results, clauses)
    trace.append(trace_step("conditions", [], [], len(results), started))

    # 5. Follow references from triggered clauses
    started = time.perf_counter()
    traverse = registry.TRAVERSERS[defs[REFERENCES]["traverse"]]
    for result in results:
        if result["status"] == "triggered":
            result["follows"] = [c["clauseId"] for c in traverse(result["clauseId"])]
    followed = sum(len(r.get("follows", [])) for r in results)
    trace.append(trace_step("references", [db.CLAUSES], ["$graphLookup"], followed, started))

    # 6. Run each triggered clause's action handler
    started = time.perf_counter()
    actions = []
    for result in results:
        if result["status"] == "triggered":
            handler = registry.ACTIONS[defs[f"action:{result['action']['type']}"]["handler"]]
            actions.append(handler(result))
    trace.append(trace_step("actions", [], [], len(actions), started))

    return {
        "shipmentId": shipment_id,
        "contractRef": shipment["contractRef"],
        "period": {"start": start, "end": end},
        "results": results,
        "actions": actions,
        "trace": trace,
    }


def trace_step(step: str, collections: list[str], features: list[str], count: int, started: float) -> Doc:
    """Records one engine step for the trace.

    Args:
        step: Step name: ``object``, ``clauses``, ``events``, ``conditions``,
            ``references``, or ``actions``.
        collections: Collections the step reads; empty for steps in code.
        features: MongoDB features the step uses, e.g. ``["$graphLookup"]``.
        count: What the step produced: clauses, events, results, ...
        started: ``time.perf_counter()`` when the step began.

    Returns:
        ``{"step", "collections", "features", "count", "ms"}``.
    """
    ms = round((time.perf_counter() - started) * 1000, 1)
    return {"step": step, "collections": collections, "features": features, "count": count, "ms": ms}


QUOTED_STATUSES = frozenset({"triggered", "unresolved"})
"""Statuses whose results carry the clause text, because the answer quotes them."""


def attach_sources(results: list[Doc], clauses: list[Doc]) -> None:
    """Sets ``source`` on every result, and ``text`` on those the answer quotes.

    ``source`` names the document and article, for citing. ``text`` is added
    only for ``triggered`` and ``unresolved`` results: those are the
    obligations and open questions an answer quotes, while a not-triggered
    clause is explained by its ``basis``. ``get_clause`` still returns any
    clause's text on request.

    Modifies ``results`` in place; results and clauses are in the same order.
    """
    for result, clause in zip(results, clauses, strict=True):
        result["source"] = clause.get("source")
        if result["status"] in QUOTED_STATUSES:
            result["text"] = clause.get("text")


def detect_events(event_ids: set[str], scope: Doc, start: datetime, end: datetime) -> dict[str, list[Doc]]:
    """Runs each event type's detector once and attaches causes.

    An event type may list the event types that can cause it, in priority
    order::

        {"_id": "event:temperature_excursion", ...,
         "causes": ["event:compressor_stop", "event:door_opening"]}

    When such an event type has events, the cause detectors not already run
    are run, and :func:`detection.attach_causes` sets each event's ``cause``
    measure. With no events, the cause detectors are skipped.

    Used by the engine (step 3) and by ``find_excursions``, so both report
    the same cause.

    Args:
        event_ids: Event type ids, for example ``{"event:temperature_excursion"}``.
        scope: Reading metadata filter, e.g. ``{"meta.shipmentId": "SHP-102"}``.
        start: Window start.
        end: Window end (exclusive).

    Returns:
        Events keyed by event type id: every id asked for, plus any cause
        type that was run.
    """
    defs = ontology.ontology_docs(event_ids)
    found: dict[str, list[Doc]] = {}

    def run(event_id: str) -> None:
        found[event_id] = registry.DETECTORS[defs[event_id]["detector"]](scope, start, end)

    for event_id in sorted(event_ids):
        run(event_id)
    for event_id in sorted(event_ids):
        causes = defs[event_id].get("causes", [])
        if not (causes and found[event_id]):
            continue
        missing = [c for c in causes if c not in found]
        if missing:
            defs.update(ontology.ontology_docs(set(missing)))
            for cause_id in missing:
                run(cause_id)
        detection.attach_causes(found[event_id], {c: found[c] for c in causes})
    return found


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