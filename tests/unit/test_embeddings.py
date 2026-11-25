"""Unit tests for coldchain_copilot.embeddings: provider selection, no network.

The SDK clients are replaced with stand-ins, so what is tested is the wiring:
the configured provider is chosen, the configured model is sent, and ``kind``
reaches the provider that uses it.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from coldchain_copilot import embeddings
from coldchain_copilot.config import ConfigError, Settings


def settings(**overrides) -> Settings:
    return Settings(mongodb_uri="mongodb://unused", voyage_api_key="v-key", openai_api_key="o-key", **overrides)


def test_voyage_sends_the_model_and_kind_as_input_type(monkeypatch) -> None:
    calls = []

    class FakeClient:
        def __init__(self, api_key):
            calls.append({"api_key": api_key})

        def embed(self, texts, model, input_type):
            calls.append({"texts": texts, "model": model, "input_type": input_type})
            return SimpleNamespace(embeddings=[[1.0, 0.0]])

    monkeypatch.setattr(embeddings.voyageai, "Client", FakeClient)
    embed = embeddings.get_embedder(settings(embedding_provider="voyage", embedding_model="voyage-4"))

    assert embed(["q"], "query") == [[1.0, 0.0]]
    assert calls == [{"api_key": "v-key"}, {"texts": ["q"], "model": "voyage-4", "input_type": "query"}]


def test_openai_sends_the_model_and_keeps_order(monkeypatch) -> None:
    calls = []

    class FakeClient:
        def __init__(self, api_key):
            self.embeddings = self
            calls.append({"api_key": api_key})

        def create(self, model, input):
            calls.append({"model": model, "input": input})
            return SimpleNamespace(data=[SimpleNamespace(embedding=[float(i)]) for i in range(len(input))])

    monkeypatch.setattr(embeddings.openai, "OpenAI", FakeClient)
    embed = embeddings.get_embedder(settings(embedding_provider="openai", embedding_model="text-embedding-3-small"))

    assert embed(["a", "b"], "document") == [[0.0], [1.0]]
    assert calls[1] == {"model": "text-embedding-3-small", "input": ["a", "b"]}


def test_unknown_provider_names_the_known_ones() -> None:
    with pytest.raises(ConfigError, match="openai.*voyage"):
        embeddings.get_embedder(settings(embedding_provider="nope"))


def test_missing_key_is_a_config_error() -> None:
    with pytest.raises(ConfigError, match="VOYAGE_API_KEY"):
        embeddings.get_embedder(Settings(mongodb_uri="mongodb://unused", embedding_provider="voyage"))
