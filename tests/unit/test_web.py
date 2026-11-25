"""Unit tests for coldchain_copilot.web.app, with a stand-in gateway and agent."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from coldchain_copilot.web import app as web


@pytest.fixture
def client() -> TestClient:
    return TestClient(web.app)


def parse_events(text: str) -> list[tuple[str, dict]]:
    """Splits a server-sent event stream into (event, data) pairs."""
    events = []
    for block in text.strip().split("\n\n"):
        event, data = block.split("\n")
        events.append((event.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return events


def test_read_routes_call_the_tools_through_the_gateway(monkeypatch, client) -> None:
    calls = []
    monkeypatch.setattr(web.gateway, "call", lambda name, args: calls.append((name, args)) or {"ok": name})

    assert client.get("/api/fleets/FLEET-01?hours=6").json() == {"ok": "get_fleet_overview"}
    assert client.get("/api/shipments/SHP-102/obligations").json() == {"ok": "evaluate_obligations"}
    assert calls == [("get_fleet_overview", {"fleet_id": "FLEET-01", "hours": 6.0}),
                     ("evaluate_obligations", {"shipment_id": "SHP-102"})]


@pytest.mark.parametrize(("code", "status"), [("NOT_FOUND", 404), ("SCOPE_REQUIRED", 400)])
def test_tool_errors_become_http_errors(monkeypatch, client, code, status) -> None:
    error = {"error": {"code": code, "message": "no"}}
    monkeypatch.setattr(web.gateway, "call", lambda name, args: error)

    response = client.get("/api/shipments/SHP-999")

    assert response.status_code == status
    assert response.json()["detail"] == error["error"]


def test_ask_streams_tool_steps_tokens_and_the_answer(monkeypatch, client) -> None:
    def fake_ask(graph, question, thread_id, *, language, on_token, on_tool):
        assert (question, thread_id, language) == ("Why?", "t1", "ko")
        on_tool("tool_call", {"id": "c1", "name": "evaluate_obligations", "arguments": {}})
        on_tool("tool_result", {"id": "c1", "name": "evaluate_obligations", "result": {}, "seconds": 0.1})
        on_token("Because")
        return {"answer": "Because", "stats": {"seconds": 1.0}}

    monkeypatch.setattr(web, "get_agent", lambda: object())
    monkeypatch.setattr(web.agent, "ask", fake_ask)

    response = client.post("/api/ask", json={"question": "Why?", "threadId": "t1", "language": "ko"})

    assert response.headers["content-type"].startswith("text/event-stream")
    assert [event for event, _ in parse_events(response.text)] == ["tool_call", "tool_result", "token", "done"]
    assert parse_events(response.text)[-1][1] == {"answer": "Because", "stats": {"seconds": 1.0}}


def test_ask_ends_with_an_error_event_when_the_run_fails(monkeypatch, client) -> None:
    def failing_ask(*args, **kwargs):
        raise RuntimeError("model down")

    monkeypatch.setattr(web, "get_agent", lambda: object())
    monkeypatch.setattr(web.agent, "ask", failing_ask)

    events = parse_events(client.post("/api/ask", json={"question": "q", "threadId": "t2"}).text)

    assert events == [("error", {"message": "RuntimeError: model down"})]
