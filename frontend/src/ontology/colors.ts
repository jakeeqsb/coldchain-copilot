// One color per type, shared by the schema and the entity graph. The graphs
// sit on a dark stage in both themes, so these are fixed.

export const TYPE_COLORS: Record<string, string> = {
  Reefer: "#89a39b",
  Shipment: "#00ed64",
  Contract: "#9ab7ff",
  Clause: "#ffc010",
  EventType: "#ff8a6b",
  CargoClass: "#5ec8c0",
  ActionType: "#b8c4c2",
  Party: "#e6a8d7",
  Reading: "#2f9fbf",
  KnowledgeChunk: "#7ad3e8",
};

export const STATUS_COLORS: Record<string, string> = { triggered: "#ff6b5b", unresolved: "#ffc010", not_triggered: "#5c7a82" };
