"""Unit tests for coldchain_copilot.web.graph: building the graphs, no database."""

from __future__ import annotations

from coldchain_copilot.web import graph

DOCS = [
    {"_id": "Shipment", "kind": "objectType", "collection": "shipments", "key": "shipmentId", "properties": {}},
    {"_id": "Contract", "kind": "objectType", "key": ["contractId", "version"], "properties": {}},
    {"_id": "cargo:seafood", "kind": "class", "parent": None, "ancestors": []},
    {"_id": "cargo:live_fish", "kind": "class", "parent": "cargo:seafood", "ancestors": ["cargo:seafood"]},
    {"_id": "rel:governedBy", "kind": "linkType", "from": "Shipment", "to": "Contract"},
    {"_id": "rel:appliesTo", "kind": "linkType", "from": "Clause", "to": "cargo:seafood"},
    {"_id": "rel:triggeredBy", "kind": "linkType", "from": "Clause", "to": "eventType"},
    {"_id": "event:excursion", "kind": "eventType", "causes": ["event:stop"]},
    {"_id": "event:stop", "kind": "eventType"},
    {"_id": "action:notify", "kind": "actionType", "handler": "notify"},
    {"_id": "party:shipper.qa", "kind": "party"},
]


def test_schema_has_object_types_and_one_node_per_kind() -> None:
    schema = graph.build_schema(DOCS, {"Shipment": 5, "CargoClass": 2})

    nodes = {n["id"]: n for n in schema["nodes"]}
    assert set(nodes) == {"Shipment", "Contract", "CargoClass", "EventType", "ActionType", "Party", "KnowledgeChunk"}
    assert (nodes["Shipment"]["count"], nodes["CargoClass"]["count"], nodes["Contract"]["count"]) == (5, 2, 0)


def test_link_type_ends_map_to_schema_nodes() -> None:
    edges = graph.build_schema(DOCS, {})["edges"]

    declared = {(e["from"], e["to"], e["name"]) for e in edges if e["linkType"]}
    assert declared == {("Shipment", "Contract", "governedBy"), ("Clause", "CargoClass", "appliesTo"),
                        ("Clause", "EventType", "triggeredBy")}
    assert all(e["field"] for e in edges if not e["linkType"])  # field references name their field


def test_entities_connect_shipments_clauses_and_ontology_entries() -> None:
    shipments = [{"shipmentId": "SHP-1", "reeferId": "RF-1", "cargoType": "cargo:live_fish",
                  "contractRef": {"contractId": "c", "version": "v1"}}]
    clauses = [
        {"clauseId": "c-art6", "contractId": "c", "version": "v1", "appliesTo": ["cargo:live_fish"],
         "trigger": {"eventType": "event:excursion"}, "action": {"type": "notify", "party": "shipper.qa"},
         "references": []},
        {"clauseId": "sop-1", "contractId": None, "appliesTo": ["cargo:seafood"], "trigger": {},
         "action": {"type": "notify"}, "references": ["c-art6"]},
    ]

    entities = graph.build_entities(DOCS, shipments, clauses)

    types = {n["id"]: n["type"] for n in entities["nodes"]}
    assert types["SHP-1"] == "Shipment" and types["RF-1"] == "Reefer" and types["c@v1"] == "Contract"
    assert types["cargo:live_fish"] == "CargoClass" and types["sop-1"] == "Clause"
    edges = {(e["from"], e["to"], e["name"]) for e in entities["edges"]}
    assert {("RF-1", "SHP-1", "assignedTo"), ("SHP-1", "c@v1", "governedBy"), ("c@v1", "c-art6", "hasClause"),
            ("c-art6", "event:excursion", "triggeredBy"), ("c-art6", "party:shipper.qa", "party"),
            ("sop-1", "c-art6", "references"), ("cargo:live_fish", "cargo:seafood", "parent"),
            ("event:excursion", "event:stop", "causes")} <= edges
    assert not any(e["from"] == "None@None" for e in entities["edges"])  # contract-free clauses have no contract
