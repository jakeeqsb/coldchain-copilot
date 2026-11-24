"""Unit tests for coldchain_copilot.engine that need no database.

The full evaluation runs in tests/integration/test_scenarios.py. Here:

- the period rule: the object type names the start and end fields, and an
  empty end means the period is still open;
- ``detect_events`` with stand-in detectors and ontology: each detector runs
  once, and causes come from the event type's ``causes`` list.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from coldchain_copilot import engine, ontology, registry
from coldchain_copilot.engine import object_period

NOW = datetime(2026, 10, 15, 3, 0, tzinfo=timezone.utc)
SHIPMENT_PERIOD = {"start": "departedAt", "end": "deliveredAt"}


def test_delivered_shipment_runs_departure_to_delivery() -> None:
    departed = datetime(2026, 10, 12, tzinfo=timezone.utc)
    delivered = datetime(2026, 10, 14, tzinfo=timezone.utc)
    shipment = {"departedAt": departed, "deliveredAt": delivered}
    assert object_period(shipment, SHIPMENT_PERIOD, now=NOW) == (departed, delivered)


def test_shipment_in_transit_runs_to_now_and_is_not_capped() -> None:
    departed = NOW - timedelta(hours=100)  # longer than MAX_WINDOW_HOURS on purpose
    assert object_period({"departedAt": departed, "deliveredAt": None}, SHIPMENT_PERIOD, now=NOW) == (departed, NOW)


def test_fields_come_from_the_period_definition() -> None:
    # Another object type (a lot in a pharma domain, say) names other fields.
    opened, closed = datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2026, 2, 1, tzinfo=timezone.utc)
    lot = {"releasedAt": opened, "expiredAt": closed}
    assert object_period(lot, {"start": "releasedAt", "end": "expiredAt"}, now=NOW) == (opened, closed)


# --------------------------------------------------------------- detect_events

EXCURSION, STOP, DOOR = "event:temperature_excursion", "event:compressor_stop", "event:door_opening"


def event(event_type: str, start: int, end: int) -> dict:
    at = lambda minute: NOW + timedelta(minutes=minute)  # noqa: E731
    return {"eventType": event_type, "shipmentId": "SHP-102", "start": at(start), "end": at(end), "measures": {}}


@pytest.fixture
def detectors(monkeypatch):
    """Stand-in ontology and detectors; returns ``(calls, found)``.

    ``calls`` records each detector run; ``found`` is what each returns.

    The excursion at minutes 100-124 overlaps both the compressor stop and
    the door opening, so the order of ``causes`` decides.
    """
    defs = {
        EXCURSION: {"_id": EXCURSION, "detector": "excursion", "causes": [STOP, DOOR]},
        STOP: {"_id": STOP, "detector": "stop"},
        DOOR: {"_id": DOOR, "detector": "door"},
    }
    found = {"excursion": [event(EXCURSION, 100, 124)], "stop": [event(STOP, 95, 124)], "door": [event(DOOR, 110, 115)]}
    calls: list[str] = []

    def detector(name: str):
        return lambda scope, start, end: calls.append(name) or [dict(e, measures={}) for e in found[name]]

    monkeypatch.setattr(ontology, "ontology_docs", lambda ids: {i: defs[i] for i in ids if i in defs})
    monkeypatch.setattr(registry, "DETECTORS", {name: detector(name) for name in found})
    return calls, found


def test_causes_follow_the_order_of_the_causes_list(detectors) -> None:
    calls, _ = detectors
    events = engine.detect_events({EXCURSION}, {}, NOW, NOW)

    assert events[EXCURSION][0]["measures"]["cause"] == "cause:compressor_stop"
    assert sorted(calls) == ["door", "excursion", "stop"]


def test_each_detector_runs_once_when_a_cause_is_also_asked_for(detectors) -> None:
    calls, _ = detectors
    events = engine.detect_events({EXCURSION, STOP, DOOR}, {}, NOW, NOW)

    assert sorted(calls) == ["door", "excursion", "stop"]
    assert events[STOP] == [event(STOP, 95, 124)]  # cause events are returned unchanged


def test_cause_detectors_are_skipped_without_events(detectors) -> None:
    calls, found = detectors
    found["excursion"] = []

    assert engine.detect_events({EXCURSION}, {}, NOW, NOW) == {EXCURSION: []}
    assert calls == ["excursion"]
