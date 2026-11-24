"""End-to-end engine runs against seeded data (needs MongoDB with scripts/seed.py loaded).

Each test evaluates one seeded shipment with ``engine.evaluate_shipment`` and
checks every clause's status against design/ontology.md §6, plus the
deadline, the referenced follow-up clause, and the briefing items.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from coldchain_copilot import db, engine, registry
from coldchain_copilot.errors import ToolError
from coldchain_copilot.tools import sensor

pytestmark = pytest.mark.integration

T, N, U = "triggered", "not_triggered", "unresolved"

RECOMMENDATIONS = [
    "manual-reefer-maintenance-v1-sec2",
    "manual-reefer-maintenance-v1-sec3",
    "manual-reefer-maintenance-v1-sec4",
    "sop-excursion-response-v1-sec2",
    "sop-excursion-response-v1-sec3",
    "sop-excursion-response-v1-sec4",
]

EXPECTED = {
    "SHP-101": {
        "blueharbor-live-fish-v1-art6": N, "blueharbor-live-fish-v1-art7": N, "blueharbor-live-fish-v1-art8": N,
        **dict.fromkeys(RECOMMENDATIONS, N),
    },
    "SHP-102": {
        "blueharbor-live-fish-v1-art6": T, "blueharbor-live-fish-v1-art7": T, "blueharbor-live-fish-v1-art8": N,
        "manual-reefer-maintenance-v1-sec2": N, "manual-reefer-maintenance-v1-sec3": N,
        "manual-reefer-maintenance-v1-sec4": T,
        "sop-excursion-response-v1-sec2": T, "sop-excursion-response-v1-sec3": N,
        "sop-excursion-response-v1-sec4": T,
    },
    "SHP-103": {
        "oceanpeak-tuna-v1-art5": T, "oceanpeak-tuna-v1-art6": T, "oceanpeak-tuna-v1-art7": T,
        "manual-reefer-maintenance-v1-sec2": N, "manual-reefer-maintenance-v1-sec3": N,
        "manual-reefer-maintenance-v1-sec4": N,
        "sop-excursion-response-v1-sec2": N, "sop-excursion-response-v1-sec3": T,
        "sop-excursion-response-v1-sec4": T,
    },
    "SHP-104": {
        "coastalfresh-shrimp-v1-art5": T,
        "manual-reefer-maintenance-v1-sec2": T, "manual-reefer-maintenance-v1-sec3": N,
        "manual-reefer-maintenance-v1-sec4": N,
        "sop-excursion-response-v1-sec2": N, "sop-excursion-response-v1-sec3": N,
        "sop-excursion-response-v1-sec4": N,
    },
    "SHP-105": {
        "tidalpearl-oyster-v1-art5": U, "tidalpearl-oyster-v1-art6": N,
        **dict.fromkeys(RECOMMENDATIONS, N),
    },
}


@pytest.mark.parametrize("shipment_id", sorted(EXPECTED))
def test_every_clause_status(mongo_db, shipment_id: str) -> None:
    report = engine.evaluate_shipment(shipment_id)
    assert {r["clauseId"]: r["status"] for r in report["results"]} == EXPECTED[shipment_id]


def test_shp102_art6_deadline_and_follow_up(mongo_db) -> None:
    report = engine.evaluate_shipment("SHP-102")
    art6 = next(r for r in report["results"] if r["clauseId"] == "blueharbor-live-fish-v1-art6")

    assert art6["deadline"] == art6["event"]["start"] + timedelta(minutes=60)
    assert art6["follows"] == ["blueharbor-live-fish-v1-art7"]  # via follow_references ($graphLookup)
    assert {"measure": "consecutiveMinutes", "op": "gte", "required": 15, "actual": 24, "met": True} in art6["basis"]


def test_shp102_briefing_items(mongo_db) -> None:
    actions = engine.evaluate_shipment("SHP-102")["actions"]
    by_clause = {a["clauseId"]: a for a in actions}

    assert set(by_clause) == {c for c, s in EXPECTED["SHP-102"].items() if s == T}
    assert by_clause["blueharbor-live-fish-v1-art6"]["action"] == "notify"
    assert by_clause["blueharbor-live-fish-v1-art6"]["party"] == "shipper.qa"
    assert by_clause["blueharbor-live-fish-v1-art6"]["evidence"] == "blueharbor-live-fish-v1-article-6"


def test_unknown_shipment(mongo_db) -> None:
    with pytest.raises(ToolError) as exc_info:
        engine.evaluate_shipment("SHP-999")
    assert exc_info.value.code == "NOT_FOUND"


def test_load_object_reads_the_shipment_through_its_object_type(mongo_db) -> None:
    now = datetime.now(timezone.utc)
    shipment, start, end = engine.load_object("Shipment", "SHP-102", now)

    assert shipment["shipmentId"] == "SHP-102" and "_id" not in shipment
    assert (start, end) == (shipment["departedAt"], now)  # in transit: the period ends now


def test_engine_and_sensor_tools_use_the_same_period(mongo_db) -> None:
    now = datetime.now(timezone.utc)
    period = engine.evaluate_shipment("SHP-102", now=now)["period"]
    _, start, end = sensor.resolve(shipment_id="SHP-102", now=now)

    assert (start, end) == (period["start"], period["end"])


def test_unknown_object_names_its_type_and_key(mongo_db) -> None:
    with pytest.raises(ToolError) as exc_info:
        engine.load_object("Shipment", "SHP-999")
    assert exc_info.value.message == "No Shipment with shipmentId SHP-999."


@pytest.mark.parametrize(("shipment_id", "cause"), [("SHP-102", "cause:compressor_stop"),
                                                    ("SHP-103", "cause:door_opening")])
def test_detect_events_attaches_the_cause_from_the_ontology(mongo_db, shipment_id: str, cause: str) -> None:
    _, start, end = engine.load_object("Shipment", shipment_id)
    events = engine.detect_events({"event:temperature_excursion"}, {"meta.shipmentId": shipment_id}, start, end)

    [excursion] = events["event:temperature_excursion"]
    assert excursion["measures"]["cause"] == cause


def test_evaluation_runs_each_detector_once(mongo_db, monkeypatch) -> None:
    calls: list[str] = []

    def counted(name, detector):
        return lambda *args: calls.append(name) or detector(*args)

    monkeypatch.setattr(registry, "DETECTORS", {n: counted(n, d) for n, d in registry.DETECTORS.items()})
    engine.evaluate_shipment("SHP-102")  # its clauses wait on the excursion and both of its causes

    assert {"detect_compressor_stop", "detect_door_opening", "detect_temperature_excursion"} <= set(calls)
    assert len(calls) == len(set(calls))


def test_triggered_clause_carries_its_source_text(mongo_db) -> None:
    if db.collection(db.KNOWLEDGE).estimated_document_count() == 0:
        pytest.skip("knowledge is empty: run scripts/ingest_docs.py")
    by_clause = {r["clauseId"]: r for r in engine.evaluate_shipment("SHP-102")["results"]}

    art6, art8 = by_clause["blueharbor-live-fish-v1-art6"], by_clause["blueharbor-live-fish-v1-art8"]
    assert art6["source"].endswith("§ Article 6") and "15 consecutive minutes" in art6["text"]
    assert art8["status"] == "not_triggered" and art8["source"].endswith("§ Article 8") and "text" not in art8


def test_fleet_briefing_matches_the_single_tools(mongo_db) -> None:
    from coldchain_copilot.tools import briefing

    result = briefing.collect_fleet_briefing("FLEET-01")

    # Which shipments are in the last 24 hours depends on when seed.py ran, so
    # the test checks consistency, not a fixed list.
    by_shipment = {s["shipment"]["shipmentId"]: s["obligations"] for s in result["shipments"]}
    assert list(by_shipment) == [row["shipmentId"] for row in result["overview"]["shipments"]]
    for shipment_id, obligations in by_shipment.items():
        assert obligations["results"] == briefing.evaluate_obligations(shipment_id)["results"]
