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

Build it with :func:`build_agent` and send questions with :func:`ask`,
which also measures what each question used (:func:`turn_stats`). The
terminal front end is ``coldchain_copilot.cli``.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.graph import END, START, MessagesState, StateGraph

from coldchain_copilot import db
from coldchain_copilot.config import Settings, get_settings
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
- You are read-only. You cannot send, notify, schedule, or change anything,
  and you never offer to. Say what must be done, by whom, and by when;
  people act on it.
- Get facts only from tools. Never state a number, time, deadline, or
  obligation that no tool returned.
- For any question about what must be done, by whom, or by when, call
  evaluate_obligations for the shipment. It decides whether each clause is
  triggered; do not judge thresholds yourself.
- Write "fact vs. condition" from the clause's basis: the actual value
  against the required one, with the comparison (for example
  "24 min ≥ 15 min" or "24 min < 30 min"). For a clause that follows from
  another, name that clause. Do not restate a fact without its condition.
- Quote times from the ...Local fields (KST). Never convert time zones.
- Cite documents, never tools. Cite every obligation, deadline, and
  recommendation with the source a tool returned (a chunk source or
  chunkId). Never name a tool in the answer. Quote the text that
  evaluate_obligations returns; use get_clause only for a clause it did not
  give the text of.
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
            (``chat_model(settings).bind_tools(gateway.SCHEMAS)``). Tests pass a
            stand-in with an ``invoke(messages)`` method.
        checkpointer: Where conversation state is saved; ``MongoDBSaver`` in
            :func:`build_agent`, an in-memory saver in tests.

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


def chat_model(settings: Settings) -> Any:
    """Builds the chat model named by ``LLM_MODEL`` (``provider:model``).

    ``init_chat_model`` is LangChain's factory for every provider it
    integrates, so changing the provider is a configuration change, not a
    code change (rule F1). The provider's integration reads its own API key
    from the environment (``OPENAI_API_KEY`` for ``openai:...``).

    Options that only one provider understands are added for that provider:
    newer OpenAI models take tool calls only through the Responses API, and
    ``LLM_REASONING_EFFORT`` is OpenAI's ``reasoning.effort``.
    """
    options: dict[str, Any] = {}
    if settings.llm_model.startswith("openai:"):
        options["use_responses_api"] = True
        if settings.llm_reasoning_effort:
            options["reasoning"] = {"effort": settings.llm_reasoning_effort}
    return init_chat_model(settings.llm_model, **options)


def build_agent():
    """Builds the agent with the configured chat model and MongoDB checkpointer."""
    settings = get_settings()
    checkpointer = MongoDBSaver(db.get_client(), db_name=settings.db_name)
    return build_graph(chat_model(settings).bind_tools(gateway.SCHEMAS), checkpointer)


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
