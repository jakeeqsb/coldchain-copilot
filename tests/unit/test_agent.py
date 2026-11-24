"""Unit tests for coldchain_copilot.agent: graph wiring, no LLM and no database.

A scripted stand-in replaces the chat model, and ``gateway.call`` is
replaced so no tool touches MongoDB. What is tested is the loop itself:
tool calls go through the gateway, results come back as ToolMessages, and the
graph stops when the model answers.
"""

from __future__ import annotations

import json

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from coldchain_copilot import agent
from coldchain_copilot.config import Settings
from coldchain_copilot.tools import gateway


class ScriptedModel:
    """Returns the given AI messages in order and records what it was sent."""

    def __init__(self, *replies: AIMessage) -> None:
        self.replies = list(replies)
        self.seen: list[list] = []

    def invoke(self, messages):
        self.seen.append(messages)
        return self.replies.pop(0)


def tool_call(name: str, args: dict, call_id: str) -> dict:
    return {"name": name, "args": args, "id": call_id, "type": "tool_call"}


def config(thread: str) -> dict:
    return {"configurable": {"thread_id": thread}}


def test_answer_without_tools_ends_after_one_llm_step() -> None:
    model = ScriptedModel(AIMessage("Hello."))
    graph = agent.build_graph(model, InMemorySaver())

    state = graph.invoke({"messages": [("user", "hi")]}, config("t1"))

    assert state["messages"][-1].content == "Hello."
    assert len(model.seen) == 1
    assert isinstance(model.seen[0][0], SystemMessage)


def test_tool_calls_go_through_the_gateway_and_come_back(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(gateway, "call", lambda name, args: calls.append((name, args)) or {"ok": name})

    model = ScriptedModel(
        AIMessage("", tool_calls=[tool_call("get_shipment", {"shipment_id": "SHP-102"}, "c1"),
                                  tool_call("evaluate_obligations", {"shipment_id": "SHP-102"}, "c2")]),
        AIMessage("Briefing."),
    )
    graph = agent.build_graph(model, InMemorySaver())
    state = graph.invoke({"messages": [("user", "brief SHP-102")]}, config("t2"))

    assert calls == [("get_shipment", {"shipment_id": "SHP-102"}),
                     ("evaluate_obligations", {"shipment_id": "SHP-102"})]
    tool_messages = [m for m in state["messages"] if isinstance(m, ToolMessage)]
    assert [m.tool_call_id for m in tool_messages] == ["c1", "c2"]
    assert json.loads(tool_messages[1].content) == {"ok": "evaluate_obligations"}
    # The second llm step sees the tool results.
    assert any(isinstance(m, ToolMessage) for m in model.seen[1])
    assert state["messages"][-1].content == "Briefing."


def test_tool_error_is_passed_to_the_model_not_raised(monkeypatch) -> None:
    monkeypatch.setattr(gateway, "call", lambda name, args: {"error": {"code": "SCOPE_REQUIRED", "message": "x"}})
    model = ScriptedModel(AIMessage("", tool_calls=[tool_call("find_excursions", {}, "c1")]), AIMessage("Need a fleet."))

    state = agent.build_graph(model, InMemorySaver()).invoke({"messages": [("user", "excursions?")]}, config("t3"))

    assert "SCOPE_REQUIRED" in [m for m in state["messages"] if isinstance(m, ToolMessage)][0].content
    assert state["messages"][-1].content == "Need a fleet."


def test_same_thread_keeps_history() -> None:
    model = ScriptedModel(AIMessage("First."), AIMessage("Second."))
    graph = agent.build_graph(model, InMemorySaver())

    graph.invoke({"messages": [("user", "one")]}, config("t4"))
    graph.invoke({"messages": [("user", "two")]}, config("t4"))

    contents = [m.content for m in model.seen[1][1:]]  # skip the system prompt
    assert contents == ["one", "First.", "two"]


def test_system_prompt_states_the_rules_that_tools_rely_on() -> None:
    prompt = agent.SYSTEM_PROMPT
    for rule in ("evaluate_obligations", "Local", "unresolved", "Needs Confirmation", "Never convert time zones",
                 "read-only", "basis", "Never name a tool"):
        assert rule in prompt


def test_stats_cover_only_this_question(monkeypatch) -> None:
    monkeypatch.setattr(gateway, "call", lambda name, args: {"error": {"code": "X", "message": "y"}}
                        if name == "find_excursions" else {"ok": True})
    model = ScriptedModel(
        AIMessage("Earlier.", usage_metadata={"input_tokens": 999, "output_tokens": 9, "total_tokens": 1008}),
        AIMessage("", tool_calls=[tool_call("get_shipment", {}, "a"), tool_call("find_excursions", {}, "b"),
                                  tool_call("get_shipment", {}, "c")],
                  usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120}),
        AIMessage("Done.", usage_metadata={"input_tokens": 300, "output_tokens": 50, "total_tokens": 350}),
    )
    graph = agent.build_graph(model, InMemorySaver())
    agent.ask(graph, "first", "t5")

    result = agent.ask(graph, "second", "t5")
    stats = result["stats"]

    assert result["answer"] == "Done."
    assert stats["llm_calls"] == 2
    assert (stats["input_tokens"], stats["output_tokens"]) == (400, 70)  # the 999 from the first question is excluded
    assert stats["tools"] == {"get_shipment": 2, "find_excursions": 1}
    assert stats["tool_errors"] == 1
    assert stats["llm_seconds"] >= 0 and stats["tool_seconds"] >= 0


def test_answer_is_text_even_when_content_is_blocks() -> None:
    blocks = [{"type": "reasoning", "summary": []}, {"type": "text", "text": "Briefing."}]
    graph = agent.build_graph(ScriptedModel(AIMessage(content=blocks)), InMemorySaver())

    assert agent.ask(graph, "brief", "t7")["answer"] == "Briefing."


def test_tool_calls_in_one_turn_run_concurrently(monkeypatch) -> None:
    import threading
    import time as clock

    running, peak, lock = [0], [0], threading.Lock()

    def slow_call(name, args):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        clock.sleep(0.2)
        with lock:
            running[0] -= 1
        return {"ok": args["n"]}

    monkeypatch.setattr(gateway, "call", slow_call)
    model = ScriptedModel(
        AIMessage("", tool_calls=[tool_call("get_shipment", {"n": i}, f"c{i}") for i in range(4)]),
        AIMessage("Done."),
    )
    state = agent.build_graph(model, InMemorySaver()).invoke({"messages": [("user", "x")]}, config("t6"))

    assert peak[0] > 1
    results = [json.loads(m.content)["ok"] for m in state["messages"] if isinstance(m, ToolMessage)]
    assert results == [0, 1, 2, 3]  # call order is kept


def test_chat_model_comes_from_llm_model_with_openai_options(monkeypatch) -> None:
    seen = []
    monkeypatch.setattr(agent, "init_chat_model", lambda model, **options: seen.append((model, options)))

    agent.chat_model(Settings(mongodb_uri="x", llm_model="openai:gpt-6.1-terra", llm_reasoning_effort="low"))
    agent.chat_model(Settings(mongodb_uri="x", llm_model="anthropic:claude-sonnet-5-5", llm_reasoning_effort="low"))

    assert seen == [
        ("openai:gpt-6.1-terra", {"use_responses_api": True, "reasoning": {"effort": "low"}}),
        ("anthropic:claude-sonnet-5-5", {}),  # OpenAI-only options are not sent to other providers
    ]
