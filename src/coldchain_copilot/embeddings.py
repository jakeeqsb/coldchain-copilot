"""Embedding providers, chosen by configuration.

Text is embedded in two places: ``ingest.py`` embeds document chunks before
they are stored, and ``tools/documents.py`` embeds a question for
``$vectorSearch``. Both must use the same model, and neither should know
which company provides it. This module is the only place that imports an
embedding SDK (rule F1, design/decisions.md § 7).

An embedder is a plain function::

    embed(texts, kind) -> vectors

``kind`` is ``"document"`` for stored chunks and ``"query"`` for a question.
Some providers embed the two differently (Voyage's ``input_type``); others
ignore it.

``EMBEDDERS`` maps ``EMBEDDING_PROVIDER`` to a factory that builds the
function from the settings, so adding a provider is one factory and one
entry. The model is ``EMBEDDING_MODEL``; changing either means running
``scripts/ingest_docs.py`` again, because stored vectors and query vectors
must come from the same model.

Typical usage:

    embed = get_embedder(get_settings())
    vectors = embed(["Article 6: ..."], "document")
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

import openai
import voyageai

from .config import ConfigError, Settings

Kind = Literal["document", "query"]

Embed = Callable[[list[str], Kind], list[list[float]]]
"""``(texts, kind) -> one vector per text``, in the order of ``texts``."""


def voyage_embedder(settings: Settings) -> Embed:
    """Voyage AI. ``kind`` is sent as Voyage's ``input_type``.

    Raises:
        ConfigError: ``VOYAGE_API_KEY`` is not set.
    """
    client = voyageai.Client(api_key=settings.require_voyage_key())

    def embed(texts: list[str], kind: Kind) -> list[list[float]]:
        return client.embed(texts, model=settings.embedding_model, input_type=kind).embeddings

    return embed


def openai_embedder(settings: Settings) -> Embed:
    """OpenAI. The API makes no query/document distinction, so ``kind`` is ignored.

    Raises:
        ConfigError: ``OPENAI_API_KEY`` is not set.
    """
    client = openai.OpenAI(api_key=settings.require_openai_key())

    def embed(texts: list[str], kind: Kind) -> list[list[float]]:
        response = client.embeddings.create(model=settings.embedding_model, input=texts)
        return [item.embedding for item in response.data]

    return embed


EMBEDDERS: dict[str, Callable[[Settings], Embed]] = {
    "voyage": voyage_embedder,
    "openai": openai_embedder,
}
"""``EMBEDDING_PROVIDER`` values → factories. Signature: ``(settings) -> embed``."""


def get_embedder(settings: Settings) -> Embed:
    """Builds the embedder named by ``settings.embedding_provider``.

    Raises:
        ConfigError: The provider is not in ``EMBEDDERS``, or its API key is
            not set.
    """
    factory = EMBEDDERS.get(settings.embedding_provider)
    if factory is None:
        raise ConfigError(
            f"EMBEDDING_PROVIDER must be one of {sorted(EMBEDDERS)}, got {settings.embedding_provider!r}."
        )
    return factory(settings)
