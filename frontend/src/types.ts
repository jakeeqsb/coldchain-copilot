// Response shapes of the backend API (design/demo-app.md § 4).
// Times are ISO 8601 in UTC; a `...Local` sibling is the KST display string.

export type Window = { start: string; startLocal: string; end: string; endLocal: string };

export type FleetRow = {
  shipmentId: string;
  reeferId: string;
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  lastTemp: number;
  avgPowerKw: number;
  doorOpenMinutes: number;
  excursionCount: number;
};

export type Fleet = { fleetId: string; window: Window; shipments: FleetRow[] };

export type TemperaturePolicy = { minC: number; maxC: number; sourceSpecVersion: string; policyVersion: string };

export type Shipment = {
  shipmentId: string;
  fleetId: string;
  reeferId: string;
  shipperId: string;
  cargoType: string;
  route: { origin: string; destination: string };
  contractRef: { contractId: string; version: string };
  temperaturePolicy: TemperaturePolicy;
  departedAt: string;
  deliveredAt: string | null;
};

export type Status = "triggered" | "not_triggered" | "unresolved";

/** Why a clause got its status: a measured condition, or a note on dependency or missing data. */
export type Basis =
  | { measure: string; op: string; required: number | string; actual: number | string | null; met: boolean }
  | { dependsOn: string }
  | { noEvent: string }
  | { missingData: string };

export type ClauseResult = {
  clauseId: string;
  kind: string;
  status: Status;
  action: { type: string; party?: string };
  deadline: string | null;
  deadlineLocal?: string;
  basis: Basis[];
  event?: { eventType: string; start: string; startLocal: string; end: string; endLocal: string } | null;
  chunkId: string;
  source: string | null;
  text?: string;
  follows?: string[];
};

export type TraceStep = {
  step: string;
  collections: string[];
  features: string[];
  count: number;
  ms: number;
  shipmentId?: string;
};

export type Obligations = {
  shipmentId: string;
  contractRef: { contractId: string; version: string };
  period: Window;
  results: ClauseResult[];
  trace: TraceStep[];
};

export type Bucket = {
  ts: string;
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  avgPowerKw: number | null;
  minPowerKw: number | null;
  doorOpen: boolean | null;
};

export type Excursion = {
  eventType: string;
  start: string;
  startLocal: string;
  end: string;
  endLocal: string;
  shipmentId: string;
  reeferId: string;
  measures: {
    consecutiveMinutes: number;
    cumulativeMinutes: number;
    peakTemp: number;
    lowestTemp: number;
    direction: "above" | "below";
    cause?: string;
  };
};

export type Series = {
  shipmentId: string;
  window: Window;
  bucketMinutes: number;
  buckets: Bucket[];
  band: TemperaturePolicy;
  excursions: Excursion[];
};

export type Stats = {
  seconds: number;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  tools: Record<string, number>;
  tool_errors: number;
  first_text_seconds?: number;
};

/** One event of the POST /api/ask stream (design/demo-app.md § 5). */
export type AskEvent =
  | { event: "tool_call"; data: { id: string; name: string; arguments: Record<string, unknown> } }
  | { event: "tool_result"; data: { id: string; name: string; result: any; seconds: number; trace?: TraceStep[] } }
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { answer: string; stats: Stats } }
  | { event: "error"; data: { message: string } };

export type Chunk = { chunkId: string; docType: string; source: string; heading: string; text: string; score?: number };

export type SchemaNode = { id: string; kind: string; count: number; definition: Record<string, unknown> };
export type SchemaEdge = { from: string; to: string; name: string; field: string | null; linkType: string | null };
export type SchemaGraph = { nodes: SchemaNode[]; edges: SchemaEdge[] };

export type EntityNode = { id: string; type: string; label: string; data: Record<string, any> };
export type EntityEdge = { from: string; to: string; name: string };
export type EntityGraph = { nodes: EntityNode[]; edges: EntityEdge[] };
