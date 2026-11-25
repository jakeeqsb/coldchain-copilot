"""Unit tests for coldchain_copilot.tools.briefing, with stand-in tools and engine."""

from __future__ import annotations

from coldchain_copilot.tools import briefing


def test_evaluate_obligations_drops_the_repeated_actions(monkeypatch) -> None:
    report = {"shipmentId": "SHP-102", "results": [{"clauseId": "x"}], "actions": [{"clauseId": "x"}]}
    monkeypatch.setattr(briefing.engine, "evaluate_shipment", lambda shipment_id: report)

    assert briefing.evaluate_obligations("SHP-102") == {"shipmentId": "SHP-102", "results": [{"clauseId": "x"}]}


def test_fleet_briefing_covers_each_shipment_in_the_overview(monkeypatch) -> None:
    rows = [{"shipmentId": "SHP-1"}, {"shipmentId": "SHP-2"}]
    monkeypatch.setattr(briefing.sensor, "get_fleet_overview", lambda fleet_id: {"fleetId": fleet_id, "shipments": rows})
    monkeypatch.setattr(briefing.sensor, "find_excursions", lambda fleet_id: {"events": ["e"]})
    monkeypatch.setattr(briefing.sensor, "find_energy_anomalies", lambda fleet_id: {"events": ["p"]})
    monkeypatch.setattr(briefing.lookup, "get_shipment", lambda shipment_id: {"shipmentId": shipment_id})
    monkeypatch.setattr(briefing, "evaluate_obligations", lambda shipment_id: {"results": [shipment_id]})

    result = briefing.collect_fleet_briefing("FLEET-01")

    assert result["fleetId"] == "FLEET-01"
    assert (result["excursions"], result["energy"]) == ({"events": ["e"]}, {"events": ["p"]})
    assert result["shipments"] == [
        {"shipment": {"shipmentId": "SHP-1"}, "obligations": {"results": ["SHP-1"]}},
        {"shipment": {"shipmentId": "SHP-2"}, "obligations": {"results": ["SHP-2"]}},
    ]
