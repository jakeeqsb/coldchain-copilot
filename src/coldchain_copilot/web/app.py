"""HTTP API for the demo app: read APIs and the ask stream.

The browser front end (``frontend/``) talks only to these routes. They add
no domain logic:

- Read APIs call ``gateway.call`` wherever a tool returns the data, so the
  browser gets the same JSON, times, and errors the LLM gets. The shipment
  series is the exception: it reads finer buckets than the tool allows
  (:func:`shipment_series`).
- The ontology routes return the graphs built in ``web/graph.py``.
- ``POST /api/ask`` runs ``agent.ask`` and streams its steps as server-sent
  events (design/demo-app.md § 5).

Run it with ``uv run coldchain-copilot-web``; the Vite dev server proxies
``/api`` here.
"""

from __future__ import annotations

import json
import queue
import threading
from collections.abc import Iterator
from datetime import timedelta
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from coldchain_copilot import agent, db, engine
from coldchain_copilot.errors import ErrorCode
from coldchain_copilot.tools import gateway, sensor
from coldchain_copilot.web import graph

Doc = dict[str, Any]

SERIES_HOURS = 24
"""Default length of the shipment series, ending at the end of the shipment period."""

SERIES_BUCKET_MINUTES = 5
"""Bucket of the shipment series: fine enough to show a 15-minute excursion."""

app = FastAPI(title="Cold-chain copilot demo")


# ------------------------------------------------------------------ read APIs


def tool(name: str, arguments: Doc) -> Doc:
    """Calls a tool through the gateway and turns a tool error into an HTTP error.

    Raises:
        HTTPException: 404 for ``NOT_FOUND``, 400 for any other error code.
    """
    result = gateway.call(name, arguments)
    if isinstance(result, dict) and "error" in result:
        status = 404 if result["error"]["code"] == ErrorCode.NOT_FOUND else 400
        raise HTTPException(status, result["error"])
    return result


@app.get("/api/fleets/{fleet_id}")
def fleet(fleet_id: str, hours: float | None = None) -> Doc:
    """Fleet overview: one row per shipment (``get_fleet_overview``)."""
    return tool("get_fleet_overview", {"fleet_id": fleet_id, "hours": hours})


@app.get("/api/shipments/{shipment_id}")
def shipment(shipment_id: str) -> Doc:
    """One shipment (``get_shipment``)."""
    return tool("get_shipment", {"shipment_id": shipment_id})


@app.get("/api/shipments/{shipment_id}/series")
def series(shipment_id: str, hours: float = SERIES_HOURS) -> Doc:
    """Measurements for the shipment dashboard; see :func:`shipment_series`."""
    found = tool("get_shipment", {"shipment_id": shipment_id})
    return {**gateway.serialize(shipment_series(shipment_id, hours)),
            "band": found["temperaturePolicy"],
            "excursions": tool("find_excursions", {"shipment_id": shipment_id})["events"]}


@app.get("/api/shipments/{shipment_id}/obligations")
def obligations(shipment_id: str) -> Doc:
    """The engine's result with its trace (``evaluate_obligations``)."""
    return tool("evaluate_obligations", {"shipment_id": shipment_id})


def shipment_series(shipment_id: str, hours: float) -> Doc:
    """Returns the shipment's readings in 5-minute buckets.

    The window is the last ``hours`` of the shipment period. It uses the
    same pipeline as ``get_reefer_timeline``, but not the tool: the tool
    widens buckets to keep the LLM's input small, and a chart has no such
    limit.

    Returns:
        ``{"shipmentId", "window", "bucketMinutes", "buckets"}``.
    """
    _, start, end = engine.load_object("Shipment", shipment_id)
    start = max(start, end - timedelta(hours=hours))
    pipeline = sensor.timeline_pipeline({"meta.shipmentId": shipment_id}, start, end, SERIES_BUCKET_MINUTES)
    return {
        "shipmentId": shipment_id,
        "window": {"start": start, "end": end},
        "bucketMinutes": SERIES_BUCKET_MINUTES,
        "buckets": list(db.collection(db.READINGS).aggregate(pipeline)),
    }


@app.get("/api/ontology/schema")
def ontology_schema() -> Doc:
    """Types and their relations (``graph.schema_graph``)."""
    return gateway.serialize(graph.schema_graph())


@app.get("/api/ontology/graph")
def ontology_graph() -> Doc:
    """Entities and their relations (``graph.entity_graph``)."""
    return gateway.serialize(graph.entity_graph())


# ------------------------------------------------------------------ ask stream


class Question(BaseModel):
    """Body of ``POST /api/ask``."""

    question: str
    threadId: str
    language: str | None = None


@lru_cache(maxsize=1)
def get_agent() -> Any:
    """Builds the agent once, on the first question."""
    return agent.build_agent()


@app.post("/api/ask")
def ask(body: Question) -> StreamingResponse:
    """Answers a question as a stream of server-sent events; see :func:`events`."""
    return StreamingResponse(events(get_agent(), body), media_type="text/event-stream")


def events(graph_: Any, body: Question) -> Iterator[str]:
    """Runs one question and yields its steps as server-sent events.

    ``agent.ask`` calls back from the thread it runs in; each callback puts
    an event on a queue, and this generator sends them in order. Events are
    ``tool_call``, ``tool_result``, ``token``, then ``done`` or ``error``.
    """
    pending: queue.Queue[tuple[str, Any] | None] = queue.Queue()

    def run() -> None:
        try:
            result = agent.ask(
                graph_, body.question, body.threadId, language=body.language,
                on_token=lambda text: pending.put(("token", {"text": text})),
                on_tool=lambda kind, data: pending.put((kind, data)),
            )
            pending.put(("done", result))
        except Exception as exc:  # noqa: BLE001 - the stream must end with an event
            pending.put(("error", {"message": f"{type(exc).__name__}: {exc}"}))
        finally:
            pending.put(None)

    threading.Thread(target=run, daemon=True).start()
    while (item := pending.get()) is not None:
        yield sse(*item)


def sse(event: str, data: Any) -> str:
    """Formats one server-sent event."""
    return f"event: {event}\ndata: {json.dumps(gateway.serialize(data), ensure_ascii=False)}\n\n"


def main() -> None:
    """Serves the API on localhost:8000."""
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
