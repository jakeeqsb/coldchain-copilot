"""The terminal front end: ask the agent questions and print the answers.

Run it:

    uv run coldchain-copilot                       # interactive, new thread
    uv run coldchain-copilot --thread demo-1       # continue a thread
    uv run coldchain-copilot -q "Brief me on FLEET-01"

Each answer is followed by one stats line for that question: elapsed time
split into model time and tool time, LLM calls, tokens, and the tools called
(with how many came back as errors).

Only display lives here. Building the agent, running a question, and
measuring it are in ``coldchain_copilot.agent``.
"""

from __future__ import annotations

import argparse
import uuid

from coldchain_copilot.agent import ask, build_agent


def main(argv: list[str] | None = None) -> None:
    """Command-line chat. Entry point of ``uv run coldchain-copilot``."""
    parser = argparse.ArgumentParser(description="Cold-chain briefing copilot")
    parser.add_argument("--thread", default=None, help="thread id to continue (default: a new one)")
    parser.add_argument("-q", "--question", default=None, help="ask one question and exit")
    args = parser.parse_args(argv)

    agent = build_agent()
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


def format_stats(stats: dict) -> str:
    """One line for the terminal.

    For example ``12.4s (LLM 10.9s, tools 1.3s) · LLM 3 · tokens 8,213 in / 1,045 out · tools 6 ...``.
    The time split appears only when ``agent.ask`` measured it.
    """
    tools = ", ".join(f"{name}×{count}" for name, count in sorted(stats["tools"].items())) or "none"
    split = f" (LLM {stats['llm_seconds']}s, tools {stats['tool_seconds']}s)" if "llm_seconds" in stats else ""
    return (
        f"{stats['seconds']}s{split} · LLM {stats['llm_calls']} · "
        f"tokens {stats['input_tokens']:,} in / {stats['output_tokens']:,} out · "
        f"tools {sum(stats['tools'].values())} ({tools}) · errors {stats['tool_errors']}"
    )


if __name__ == "__main__":
    main()
