// One color per type, shared by the schema and the entity graph. The graphs
// sit on a dark stage in both themes, so these are fixed.

export const TYPE_COLORS: Record<string, string> = {
  Reefer: "#7fa7b5",
  Shipment: "#5fd0f0",
  Contract: "#b48ef0",
  Clause: "#f0c35f",
  EventType: "#f07f5f",
  CargoClass: "#6cc08e",
  ActionType: "#9fb3bb",
  Party: "#d6a0c0",
  Reading: "#4f8fa3",
  KnowledgeChunk: "#8fb8c4",
};

export const STATUS_COLORS: Record<string, string> = { triggered: "#fb8a52", unresolved: "#e3b341", not_triggered: "#5d7480" };
