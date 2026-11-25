"""Unit tests for coldchain_copilot.config: variable names and defaults, no ``.env``."""

from __future__ import annotations

import pytest

from coldchain_copilot.config import ConfigError, load_settings


def test_model_variables_are_read_by_their_provider_neutral_names() -> None:
    settings = load_settings({
        "MONGODB_URI": "mongodb://x",
        "EMBEDDING_PROVIDER": "openai",
        "EMBEDDING_MODEL": "text-embedding-3-small",
        "LLM_MODEL": "anthropic:claude-sonnet-5-5",
        "LLM_REASONING_EFFORT": "low",
    })

    assert (settings.embedding_provider, settings.embedding_model) == ("openai", "text-embedding-3-small")
    assert (settings.llm_model, settings.llm_reasoning_effort) == ("anthropic:claude-sonnet-5-5", "low")


def test_defaults_are_voyage_and_openai() -> None:
    settings = load_settings({"MONGODB_URI": "mongodb://x"})

    assert (settings.embedding_provider, settings.embedding_model) == ("voyage", "voyage-4")
    assert settings.llm_model == "openai:gpt-6.1-terra"
    assert settings.llm_reasoning_effort is None


def test_mongodb_uri_is_required() -> None:
    with pytest.raises(ConfigError, match="MONGODB_URI"):
        load_settings({})
