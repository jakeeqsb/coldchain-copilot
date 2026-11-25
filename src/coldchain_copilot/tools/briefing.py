"""Obligation tools: the engine's decisions, and the fleet briefing built on them.

Two tools:

- ``evaluate_obligations`` (level 5): the engine's result for one shipment,
  as the LLM reads it.
- ``collect_fleet_briefing`` (level 4): everything a fleet briefing needs, in
  one call.

A fleet briefing always needs the same results: the fleet overview,
excursions, energy anomalies, and each shipment with its obligations. Left
to the LLM, that took two model round trips (fleet tools, then one call per
shipment) before it could start writing. ``collect_fleet_briefing`` makes
those calls in code, in a fixed order (rule G1); the LLM still decides when
a briefing is asked for, by choosing this tool.

Results keep ``datetime`` values; ``tools/gateway.py`` serializes them.
Each keeps the engine's ``trace`` at the top level, where the agent takes it
out before the model reads the result.
"""

from __future__ import annotations

from typing import Any

from coldchain_copilot import engine
from coldchain_copilot.tools import lookup, sensor

Doc = dict[str, Any]


def evaluate_obligations(shipment_id: str) -> Doc:
    """Returns the engine's result for a shipment without ``actions``.

    ``actions`` are the action handlers' briefing items. Today each repeats a
    triggered result (action, party, deadline, event, chunk), so the LLM
    would read the same facts twice. The engine keeps producing them: a
    handler is where a real deployment would send a notice or open a work
    order.
    """
    result = engine.evaluate_shipment(shipment_id)
    return {key: value for key, value in result.items() if key != "actions"}


def collect_fleet_briefing(fleet_id: str) -> Doc:
    """Gathers what a briefing on one fleet needs.

    The same results the fleet and shipment tools return, with their default
    windows (the last 24 hours for the fleet tools, each shipment's period
    for its obligations). The shipments are those in the fleet overview,
    that is, with readings in the window.

    Args:
        fleet_id: Fleet to brief on, for example ``"FLEET-01"``.

    Returns:
        ``fleetId``, ``overview`` (``get_fleet_overview``), ``excursions``
        (``find_excursions``), ``energy`` (``find_energy_anomalies``), and
        ``shipments``: one ``{"shipment", "obligations"}`` per shipment
        (``get_shipment``, ``evaluate_obligations``), and ``trace``: every
        shipment's engine steps, each with its ``shipmentId``.
    """
    overview = sensor.get_fleet_overview(fleet_id)
    shipments, trace = [], []
    for row in overview["shipments"]:
        obligations = evaluate_obligations(row["shipmentId"])
        trace += [{**step, "shipmentId": row["shipmentId"]} for step in obligations.pop("trace", [])]
        shipments.append({"shipment": lookup.get_shipment(row["shipmentId"]), "obligations": obligations})
    return {
        "fleetId": fleet_id,
        "overview": overview,
        "excursions": sensor.find_excursions(fleet_id=fleet_id),
        "energy": sensor.find_energy_anomalies(fleet_id=fleet_id),
        "shipments": shipments,
        "trace": trace,
    }
