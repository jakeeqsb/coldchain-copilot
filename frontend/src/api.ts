// Calls to the backend API. The Vite dev server proxies /api to FastAPI.

import type { Language } from "./i18n";
import type { AskEvent, Fleet, Obligations, Series, Shipment } from "./types";

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  fleet: (fleetId: string) => get<Fleet>(`/api/fleets/${fleetId}`),
  shipment: (shipmentId: string) => get<Shipment>(`/api/shipments/${shipmentId}`),
  series: (shipmentId: string) => get<Series>(`/api/shipments/${shipmentId}/series`),
  obligations: (shipmentId: string) => get<Obligations>(`/api/shipments/${shipmentId}/obligations`),
};

/**
 * Sends a question and calls `onEvent` for each server-sent event until the
 * stream ends. EventSource cannot POST, so the stream is read with fetch.
 */
export async function ask(
  question: string,
  threadId: string,
  language: Language,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, threadId, language }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (event && data) onEvent({ event, data: JSON.parse(data) } as AskEvent);
    }
  }
}
