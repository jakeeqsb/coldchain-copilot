"""Unit tests for coldchain_copilot.cli: the terminal display, no LLM and no database."""

from __future__ import annotations

from coldchain_copilot import cli


def test_stats_line() -> None:
    line = cli.format_stats({"seconds": 12.4, "llm_seconds": 10.9, "tool_seconds": 1.3, "llm_calls": 3,
                             "input_tokens": 8213, "output_tokens": 1045,
                             "tools": {"find_excursions": 1, "evaluate_obligations": 5}, "tool_errors": 0})
    assert line == ("12.4s (LLM 10.9s, tools 1.3s) · LLM 3 · tokens 8,213 in / 1,045 out · "
                    "tools 6 (evaluate_obligations×5, find_excursions×1) · errors 0")
