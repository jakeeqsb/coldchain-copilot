"""Unit tests for coldchain_copilot.engine that need no database.

The full evaluation runs in tests/integration/test_scenarios.py. Here only
the period rule: the object type names the start and end fields, and an
empty end means the period is still open.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

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
