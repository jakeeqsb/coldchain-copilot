"""The briefing agent: an LLM in a loop with the gateway's tools.

The graph has two nodes and one decision, and nothing else::

    START → llm ──(tool calls?)── yes → tools → llm → ...
                                 └─ no  → END (the answer)

- ``llm`` sends the conversation to the chat model with the gateway's tool
  schemas bound. The model either answers or asks for tools.
- ``tools`` runs every requested call through ``gateway.call`` and adds one
  ``ToolMessage`` per call. The gateway never raises: a failed call comes
  back as ``{"error": ...}`` and the model decides how to retry.

All domain logic stays below the gateway. The agent knows tool names only
through ``gateway.SCHEMAS``; it imports nothing from the engine or the tools.

Conversation state is saved by ``MongoDBSaver`` in the same database
(``checkpoints``, ``checkpoint_writes``), keyed by ``thread_id``, so a
follow-up question in the same thread sees the earlier tool results.

Run it:

    uv run coldchain-copilot                       # interactive, new thread
    uv run coldchain-copilot --thread demo-1       # continue a thread
    uv run coldchain-copilot -q "Brief me on FLEET-01"

Each answer is followed by one stats line for that question: elapsed time
split into model time and tool time, LLM calls, tokens, and the tools called
(with how many came back as errors).
"""

from __future__ import annotations

import argparse
import json
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.graph import END, START, MessagesState, StateGraph

from coldchain_copilot import db
from coldchain_copilot.config import get_settings
from coldchain_copilot.tools import gateway

RECURSION_LIMIT = 30
"""Most graph steps per question (each llm or tools visit is one step)."""

TOOL_WORKERS = 8
"""Tool calls requested in one model turn run concurrently, up to this many."""

SYSTEM_PROMPT = """\
You are the cold-chain operations copilot for a reefer fleet carrying seafood.
You answer operators' questions about shipments, reefer sensor data, and the
contracts, SOPs, and maintenance manuals that apply to them.

Current time: {now}.

How to work
- Get facts only from tools. Never state a number, time, deadline, or
  obligation that no tool returned.
- For any question about what must be done, by whom, or by when, call
  evaluate_obligations for the shipment. It decides whether each clause is
  triggered; do not judge thresholds yourself.
- Quote times from the ...Local fields (KST). Never convert time zones.
- Cite every obligation, deadline, and recommendation with the source a tool
  returned (a chunk source or chunkId). Use get_clause to quote a clause.
- A clause with status "unresolved" means data is missing. Report it under
  Needs Confirmation with what is missing; never report it as "no obligation".
- If a tool returns an error, read its message, fix the call, and retry once.
- Answer in the language of the question.

Briefing format (for briefing or status questions; omit empty sections)

<one-line summary>

Action Required        ← obligations with status "triggered"
· [Reefer / Shipment] <action> — <deadline> — <fact vs. condition>  [<source>]

Needs Confirmation     ← clauses with status "unresolved"
· [Reefer / Shipment] <what could not be decided, what data is missing>  [<source>]

Incident Details       ← facts from sensor tools
· <reefer, cargo, policy range>: <start–end>, <minutes>, <peak>, <cause>

Suggestion             ← recommendations with status "triggered"
· [Reefer] <action>  [<source>]

For other questions, answer directly and briefly, with sources.
"""


# --------------------------------------------------------------------- graph


def build_graph(model: Any, checkpointer: Any = None):
    """Builds and compiles the two-node agent graph.

    Args:
        model: A chat model with the gateway's tools already bound
            (``ChatOpenAI(...).bind_tools(gateway.SCHEMAS)``). Tests pass a
            stand-in with an ``invoke(messages)`` method.
        checkpointer: Where conversation state is saved; ``MongoDBSaver`` in
            :func:`create_agent`, an in-memory saver in tests.

    Returns:
        The compiled graph. Invoke it with ``{"messages": [...]}`` and a
        config naming the ``thread_id``.
    """

    def llm(state: MessagesState) -> dict:
        now = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M KST")
        prompt = SystemMessage(SYSTEM_PROMPT.format(now=now))
        return {"messages": [model.invoke([prompt, *state["messages"]])]}

    def tools(state: MessagesState) -> dict:
        # Calls from one model turn are independent, so they run concurrently;
        # map keeps the results in call order. The MongoClient is thread-safe.
        calls = state["messages"][-1].tool_calls
        with ThreadPoolExecutor(max_workers=TOOL_WORKERS) as pool:
            results = list(pool.map(lambda call: gateway.call(call["name"], call["args"]), calls))
        return {
            "messages": [
                ToolMessage(content=json.dumps(result, ensure_ascii=False), tool_call_id=call["id"], name=call["name"])
                for call, result in zip(calls, results, strict=True)
            ]
        }

    graph = StateGraph(MessagesState)
    graph.add_node("llm", llm)
    graph.add_node("tools", tools)
    graph.add_edge(START, "llm")
    graph.add_conditional_edges("llm", next_step, {"tools": "tools", END: END})
    graph.add_edge("tools", "llm")
    return graph.compile(checkpointer=checkpointer)


def next_step(state: MessagesState) -> str:
    """Routes to ``tools`` when the model asked for any, otherwise ends."""
    last = state["messages"][-1]
    return "tools" if isinstance(last, AIMessage) and last.tool_calls else END


def create_agent():
    """Builds the agent with the configured OpenAI model and MongoDB checkpointer."""
    settings = get_settings()
    # Newer OpenAI models take tool calls only through the Responses API.
    reasoning = {"effort": settings.openai_reasoning_effort} if settings.openai_reasoning_effort else None
    model = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.require_openai_key(),
        use_responses_api=True,
        reasoning=reasoning,
    )
    checkpointer = MongoDBSaver(db.get_client(), db_name=settings.db_name)
    return build_graph(model.bind_tools(gateway.SCHEMAS), checkpointer)


def ask(agent: Any, question: str, thread_id: str) -> dict:
    """Sends one question in a thread and returns the answer with its stats.

    The thread's earlier messages are counted first, so the stats cover only
    what this question added, not the whole conversation. The graph is
    streamed node by node so the time of each ``llm`` and ``tools`` step can
    be added up separately.

    Returns:
        ``{"answer": str, "stats": dict}``; see :func:`turn_stats`.
    """
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": RECURSION_LIMIT}
    before = len(agent.get_state(config).values.get("messages", []))

    seconds = {"llm": 0.0, "tools": 0.0}
    started = last = time.perf_counter()
    for update in agent.stream({"messages": [("user", question)]}, config, stream_mode="updates"):
        now = time.perf_counter()
        for node in update:
            seconds[node] = seconds.get(node, 0.0) + (now - last)
        last = now

    messages = agent.get_state(config).values["messages"]
    stats = turn_stats(messages[before:], last - started)
    stats["llm_seconds"], stats["tool_seconds"] = round(seconds["llm"], 1), round(seconds["tools"], 1)
    # .text joins the text blocks: newer models return content as a list of
    # blocks (reasoning, text, ...) rather than one string.
    return {"answer": messages[-1].text, "stats": stats}


def turn_stats(messages: list, elapsed: float) -> dict:
    """Summarizes the resources one question used.

    Args:
        messages: The messages this question added (user, AI, tool).
        elapsed: Wall-clock seconds for the whole graph run.

    Returns:
        ``seconds``, ``llm_calls``, ``input_tokens``, ``output_tokens``
        (from the model's usage metadata; 0 when the model reports none),
        ``tools`` (tool name to call count), and ``tool_errors`` (tool results
        that came back as ``{"error": ...}``).
    """
    replies = [m for m in messages if isinstance(m, AIMessage)]
    usage = [m.usage_metadata or {} for m in replies]
    results = [m for m in messages if isinstance(m, ToolMessage)]
    return {
        "seconds": round(elapsed, 1),
        "llm_calls": len(replies),
        "input_tokens": sum(u.get("input_tokens", 0) for u in usage),
        "output_tokens": sum(u.get("output_tokens", 0) for u in usage),
        "tools": dict(Counter(call["name"] for m in replies for call in m.tool_calls)),
        "tool_errors": sum(1 for m in results if '"error"' in m.content[:20]),
    }


def format_stats(stats: dict) -> str:
    """One line for the terminal.

    For example ``12.4s (LLM 10.9s, tools 1.3s) · LLM 3 · tokens 8,213 in / 1,045 out · tools 6 ...``.
    The time split appears only when :func:`ask` measured it.
    """
    tools = ", ".join(f"{name}×{count}" for name, count in sorted(stats["tools"].items())) or "none"
    split = f" (LLM {stats['llm_seconds']}s, tools {stats['tool_seconds']}s)" if "llm_seconds" in stats else ""
    return (
        f"{stats['seconds']}s{split} · LLM {stats['llm_calls']} · "
        f"tokens {stats['input_tokens']:,} in / {stats['output_tokens']:,} out · "
        f"tools {sum(stats['tools'].values())} ({tools}) · errors {stats['tool_errors']}"
    )


# ----------------------------------------------------------------------- cli


def main(argv: list[str] | None = None) -> None:
    """Command-line chat. Entry point of ``uv run coldchain-copilot``."""
    parser = argparse.ArgumentParser(description="Cold-chain briefing copilot")
    parser.add_argument("--thread", default=None, help="thread id to continue (default: a new one)")
    parser.add_argument("-q", "--question", default=None, help="ask one question and exit")
    args = parser.parse_args(argv)

    agent = create_agent()
    thread_id = args.thread or f"cli-{uuid.uuid4().hex[:8]}"

    if args.question:
        show(ask(agent, args.question, thread_id))
        return

    print(f"thread {thread_id}  (empty line to quit)")
    while question := input("\n> ").strip():
        show(ask(agent, question, thread_id))


def show(result: dict) -> None:
    """Prints an answer followed by its stats line."""
    print("\n" + result["answer"])
    print("\n── " + format_stats(result["stats"]))


if __name__ == "__main__":
    main()