"""Ontology graphs for the demo app's Ontology tab, built from the database.

Two graphs, as nodes and edges a front end can draw:

- **Schema** (:func:`schema_graph`): the types. One node per object type and
  one per ontology kind (cargo classes, event types, action types, parties),
  sized by how many documents or entities each has. Edges are the
  ontology's link types, plus the field references the engine follows that
  are not declared as link types (``FIELD_REFS``).
- **Entities** (:func:`entity_graph`): the seeded instances of those types
  (shipments, reefers, contracts, clauses, and the ontology entries) and the
  relations between them, read from the same fields.

This is for display only: documents are read with ``find`` and joined here.
The engine does not use these graphs. Each graph is built by a pure function
(:func:`build_schema`, :func:`build_entities`) so it can be tested without a
database.
"""

from __future__ import annotations

from typing import Any

from coldchain_copilot import db

Doc = dict[str, Any]

GROUPS = {"class": "CargoClass", "eventType": "EventType", "actionType": "ActionType", "party": "Party"}
"""Ontology kind → the schema node that stands for all entries of that kind."""

KNOWLEDGE_NODE = "KnowledgeChunk"
"""Schema node for the ``knowledge`` collection, which no object type defines."""

FIELD_REFS = [
    ("Shipment", "CargoClass", "cargoType", "shipments.cargoType"),
    ("Shipment", "Reading", "measuredBy", "readings.meta.shipmentId"),
    ("CargoClass", "CargoClass", "parent", "class.parent"),
    ("EventType", "EventType", "causes", "eventType.causes"),
    ("EventType", "Reading", "on", "eventType.on"),
    ("Clause", "ActionType", "action", "clauses.action.type"),
    ("Clause", "Party", "party", "clauses.action.party"),
    ("Clause", KNOWLEDGE_NODE, "chunkId", "clauses.chunkId"),
]
"""Field references the engine follows that are not link types: (from, to, name, field)."""


# ------------------------------------------------------------------ schema


def schema_graph() -> Doc:
    """Returns the schema graph of the seeded database.

    Returns:
        ``{"nodes", "edges"}``; see :func:`build_schema`.
    """
    docs = list(db.collection(db.ONTOLOGY).find())
    return build_schema(docs, type_counts(docs))


def type_counts(docs: list[Doc]) -> dict[str, int]:
    """Counts the documents or entities behind each schema node.

    An object type with a collection counts its documents. One without
    (``Reefer``, ``Contract``) counts the distinct values of its key in the
    collections of object types that have the key's fields, so it counts
    the entities the data refers to.
    """
    object_types = [d for d in docs if d["kind"] == "objectType"]
    counts = {d["_id"]: db.collection(d["collection"]).estimated_document_count()
              for d in object_types if "collection" in d}
    for definition in object_types:
        if "collection" in definition:
            continue
        key = definition["key"] if isinstance(definition["key"], list) else [definition["key"]]
        values: set[tuple] = set()
        for other in object_types:
            if "collection" in other and all(field in other["properties"] for field in key):
                group = {"_id": {field: f"${field}" for field in key}}
                for row in db.collection(other["collection"]).aggregate([{"$group": group}]):
                    if all(row["_id"].get(field) is not None for field in key):
                        values.add(tuple(row["_id"][field] for field in key))
        counts[definition["_id"]] = len(values)
    for kind, node in GROUPS.items():
        counts[node] = sum(d["kind"] == kind for d in docs)
    counts[KNOWLEDGE_NODE] = db.collection(db.KNOWLEDGE).estimated_document_count()
    return counts


def build_schema(docs: list[Doc], counts: dict[str, int]) -> Doc:
    """Builds the schema graph from the ontology documents.

    Args:
        docs: Every ``ontology`` document.
        counts: Documents or entities per node id (:func:`type_counts`).

    Returns:
        ``nodes``: ``{"id", "kind", "count", "definition"}``, where
        ``definition`` is the object type document, or for a group node one
        example entry of its kind. ``edges``: ``{"from", "to", "name",
        "field", "linkType"}``; ``linkType`` is the link type id for a
        declared link and ``None`` for a field reference.
    """
    by_id = {d["_id"]: d for d in docs}
    nodes = [{"id": d["_id"], "kind": "objectType", "count": counts.get(d["_id"], 0), "definition": d}
             for d in docs if d["kind"] == "objectType"]
    for kind, node in GROUPS.items():
        example = next((d for d in docs if d["kind"] == kind), None)
        if example is not None:
            nodes.append({"id": node, "kind": kind, "count": counts.get(node, 0), "definition": example})
    nodes.append({"id": KNOWLEDGE_NODE, "kind": "collection", "count": counts.get(KNOWLEDGE_NODE, 0),
                  "definition": {"collection": db.KNOWLEDGE}})

    edges = [
        {"from": schema_node(d["from"], by_id), "to": schema_node(d["to"], by_id),
         "name": d["_id"].removeprefix("rel:"), "field": None, "linkType": d["_id"]}
        for d in docs if d["kind"] == "linkType"
    ]
    edges += [{"from": a, "to": b, "name": name, "field": field, "linkType": None} for a, b, name, field in FIELD_REFS]
    return {"nodes": nodes, "edges": edges}


def schema_node(end: str, by_id: dict[str, Doc]) -> str:
    """Maps a link type end to its schema node.

    An end is an object type (``"Shipment"``), an ontology entry such as a
    class root (``"cargo:seafood"``), or a kind (``"eventType"``).
    """
    if end in GROUPS:
        return GROUPS[end]
    if end in by_id and by_id[end]["kind"] in GROUPS:
        return GROUPS[by_id[end]["kind"]]
    return end


# ------------------------------------------------------------------ entities


def entity_graph() -> Doc:
    """Returns the entity graph of the seeded database.

    Returns:
        ``{"nodes", "edges"}``; see :func:`build_entities`.
    """
    return build_entities(
        list(db.collection(db.ONTOLOGY).find()),
        list(db.collection(db.SHIPMENTS).find({}, {"_id": 0})),
        list(db.collection(db.CLAUSES).find({}, {"_id": 0})),
    )


def build_entities(docs: list[Doc], shipments: list[Doc], clauses: list[Doc]) -> Doc:
    """Builds the entity graph from the ontology, shipments, and clauses.

    Args:
        docs: Every ``ontology`` document.
        shipments: Every shipment.
        clauses: Every clause.

    Returns:
        ``nodes``: ``{"id", "type", "label", "data"}``, where ``type`` is the
        schema node id (``"Shipment"``, ``"CargoClass"``, ...) and ``data``
        the fields a detail panel shows. ``edges``: ``{"from", "to",
        "name"}``, named like the schema edges.
    """
    nodes: dict[str, Doc] = {}
    edges: list[Doc] = []

    def node(node_id: str, type_: str, label: str, data: Doc) -> None:
        nodes.setdefault(node_id, {"id": node_id, "type": type_, "label": label, "data": data})

    def edge(a: str, b: str, name: str) -> None:
        edges.append({"from": a, "to": b, "name": name})

    for d in docs:
        if d["kind"] in GROUPS:
            node(d["_id"], GROUPS[d["kind"]], d["_id"].split(":", 1)[-1], d)
    for d in docs:
        if d["kind"] == "class" and d.get("parent"):
            edge(d["_id"], d["parent"], "parent")
        for cause in d.get("causes", []):
            edge(d["_id"], cause, "causes")

    for s in shipments:
        contract = contract_id(s["contractRef"])
        node(s["shipmentId"], "Shipment", s["shipmentId"], s)
        node(s["reeferId"], "Reefer", s["reeferId"], {"reeferId": s["reeferId"]})
        node(contract, "Contract", contract, s["contractRef"])
        edge(s["reeferId"], s["shipmentId"], "assignedTo")
        edge(s["shipmentId"], contract, "governedBy")
        edge(s["shipmentId"], s["cargoType"], "cargoType")

    for c in clauses:
        node(c["clauseId"], "Clause", c["clauseId"], c)
        if c.get("contractId"):
            contract = contract_id(c)
            node(contract, "Contract", contract, {"contractId": c["contractId"], "version": c["version"]})
            edge(contract, c["clauseId"], "hasClause")
        for cls in c.get("appliesTo", []):
            edge(c["clauseId"], cls, "appliesTo")
        if "eventType" in c["trigger"]:
            edge(c["clauseId"], c["trigger"]["eventType"], "triggeredBy")
        for ref in c.get("references", []):
            edge(c["clauseId"], ref, "references")
        edge(c["clauseId"], f"action:{c['action']['type']}", "action")
        if c["action"].get("party"):
            edge(c["clauseId"], f"party:{c['action']['party']}", "party")

    return {"nodes": list(nodes.values()), "edges": [e for e in edges if e["from"] in nodes and e["to"] in nodes]}


def contract_id(ref: Doc) -> str:
    """Names a contract version, e.g. ``"blueharbor-live-fish@v1"``."""
    return f"{ref['contractId']}@{ref['version']}"
