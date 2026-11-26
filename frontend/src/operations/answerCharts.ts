// Which charts go with an answer, decided from the tools the agent called
// and what they returned; the LLM does not choose them (rule G1).

import type { Chunk, ClauseResult, TraceStep } from "../types";

export type ToolOutput = { name: string; result: any; trace?: TraceStep[] };

export type FleetEntry = { shipmentId: string; reeferId: string; excursionCount: number; results?: ClauseResult[] };

export type Widget =
  | { kind: "fleet"; rows: FleetEntry[] }
  | { kind: "temperature"; shipmentId: string }
  | { kind: "obligations"; shipmentId: string; results: ClauseResult[] }
  | { kind: "documents"; chunks: Chunk[] }
  | { kind: "trace"; steps: TraceStep[] };

const MAX_TEMPERATURE_CHARTS = 3;

/**
 * Returns the widgets for one answer, in display order: fleet, temperature,
 * obligations, documents, then the engine trace.
 *
 * - find_excursions, get_reefer_timeline: the temperature chart of each shipment they cover.
 * - evaluate_obligations: the clause results and deadlines; the temperature
 *   chart too when a triggered clause waits on a temperature excursion.
 * - collect_fleet_briefing, get_fleet_overview: the fleet row; the briefing
 *   also adds the temperature chart of each shipment with an excursion.
 * - search_knowledge, get_clause: the document chunks the answer can cite.
 * - Any result with an engine trace: the trace.
 */
export function chooseWidgets(outputs: ToolOutput[], shipmentOfReefer: Record<string, string>): Widget[] {
  const temperature = new Set<string>();
  const obligations = new Map<string, ClauseResult[]>();
  const chunks = new Map<string, Chunk>();
  const steps: TraceStep[] = [];
  let fleet: FleetEntry[] | null = null;

  const chartShipment = (shipmentId?: string, reeferId?: string) => {
    const id = shipmentId ?? (reeferId ? shipmentOfReefer[reeferId] : undefined);
    if (id) temperature.add(id);
  };
  const excursionShipments = (events: { shipmentId: string }[]) => events.forEach((e) => chartShipment(e.shipmentId));

  for (const { name, result, trace } of outputs) {
    if (trace) steps.push(...trace);
    if (!result || result.error) continue;

    if (name === "find_excursions") {
      if (result.events.length) excursionShipments(result.events);
      else chartShipment(result.scope["meta.shipmentId"], result.scope["meta.reeferId"]);
    } else if (name === "get_reefer_timeline") {
      chartShipment(undefined, result.reeferId);
    } else if (name === "evaluate_obligations") {
      obligations.set(result.shipmentId, result.results);
      if (result.results.some(waitsOnExcursion)) chartShipment(result.shipmentId);
    } else if (name === "collect_fleet_briefing") {
      const byShipment = new Map<string, ClauseResult[]>(
        result.shipments.map((s: any) => [s.shipment.shipmentId, s.obligations.results]),
      );
      fleet = result.overview.shipments.map((row: any) => ({ ...fleetEntry(row), results: byShipment.get(row.shipmentId) }));
      excursionShipments(result.excursions.events);
    } else if (name === "get_fleet_overview") {
      fleet ??= result.shipments.map(fleetEntry);
    } else if (name === "search_knowledge") {
      result.results.forEach((chunk: Chunk) => chunks.set(chunk.chunkId, chunk));
    } else if (name === "get_clause") {
      chunks.set(result.chunkId, result);
    }
  }

  const widgets: Widget[] = [];
  if (fleet) widgets.push({ kind: "fleet", rows: fleet });
  [...temperature].sort().slice(0, MAX_TEMPERATURE_CHARTS).forEach((shipmentId) => widgets.push({ kind: "temperature", shipmentId }));
  obligations.forEach((results, shipmentId) => widgets.push({ kind: "obligations", shipmentId, results }));
  if (chunks.size) widgets.push({ kind: "documents", chunks: [...chunks.values()] });
  if (steps.length) widgets.push({ kind: "trace", steps });
  return widgets;
}

function fleetEntry(row: any): FleetEntry {
  return { shipmentId: row.shipmentId, reeferId: row.reeferId, excursionCount: row.excursionCount };
}

function waitsOnExcursion(result: ClauseResult): boolean {
  return result.status === "triggered" && result.event?.eventType === "event:temperature_excursion";
}
