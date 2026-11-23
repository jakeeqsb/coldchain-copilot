"""Turn the source documents into ``knowledge`` chunks with embeddings.

Each Markdown file in ``docs/`` is a contract, SOP, or manual with a
frontmatter block and numbered headings::

    ---
    docId: blueharbor-live-fish
    docType: contract
    contractId: blueharbor-live-fish
    version: v1
    appliesTo: cargo:live_fish
    ---
    # BlueHarbor Fisheries Live Fish Transport Contract
    ...
    ## Article 6: Notification of Temperature Excursion
    If the internal temperature exceeds 4°C for 15 consecutive minutes ...

Every ``## Article N:`` or ``## Section N:`` heading starts one chunk, and the
chunk runs to the next heading. A clause is the unit the engine judges and the
LLM cites, so it is also the unit of retrieval: no fixed-size splitting.

The chunk id comes from ``catalog.chunk_id``, the same function the seed uses
to check ``clauses.chunkId``. That shared id is what lets a triggered clause
point at its exact source text.

Embedding happens here, in application code, with the embedder from
``embeddings.py`` (``kind="document"``); queries are embedded with
``kind="query"`` in ``tools/documents.py``. ``scripts/ingest_docs.py``
writes the result to MongoDB and creates the Vector Search index.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from coldchain_copilot.catalog import chunk_id, parse_frontmatter
from coldchain_copilot.embeddings import Embed

Doc = dict[str, Any]

HEADING = re.compile(r"^## (Article|Section) (\d+):\s*(.+)$", re.MULTILINE)
"""A chunk heading: unit, number, and title. Matches what ``catalog`` counts."""

DOC_FIELDS = ("docId", "docType", "contractId", "version", "appliesTo")
"""Frontmatter fields copied onto every chunk."""

VECTOR_INDEX = "knowledge_vector"
"""Name of the Vector Search index on ``knowledge``. ``scripts/ingest_docs.py``
creates it and ``tools/documents.py`` queries it."""

FILTER_FIELDS = ("docType", "contractId", "version", "appliesTo")
"""Chunk fields a ``$vectorSearch`` may filter on, for example only one
contract version, or only SOPs."""


def chunk_document(path: Path) -> list[Doc]:
    """Splits one document into one chunk per Article or Section.

    Text before the first heading (the title and the introduction) is not a
    clause and is left out.

    Args:
        path: A Markdown file with frontmatter.

    Returns:
        Chunks in document order. Each has ``chunkId``, the frontmatter fields
        in ``DOC_FIELDS`` that the document defines, ``source`` (a citation
        such as ``"BlueHarbor ... Contract § Article 6"``), ``heading``, and
        ``text`` (heading plus body, the text that is embedded and shown).
    """
    text = path.read_text(encoding="utf-8")
    front = parse_frontmatter(text)
    common = {field: front[field] for field in DOC_FIELDS if field in front}

    headings = list(HEADING.finditer(text))
    chunks: list[Doc] = []
    for i, match in enumerate(headings):
        unit, number, title = match.groups()
        body_end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        heading = f"{unit} {number}: {title.strip()}"
        chunks.append(
            {
                "chunkId": chunk_id(front["docId"], front["version"], unit, number),
                **common,
                "source": f"{front['title']} § {unit} {number}",
                "heading": heading,
                "text": f"{heading}\n\n{text[match.end():body_end].strip()}",
            }
        )
    return chunks


def chunk_documents(docs_dir: Path) -> list[Doc]:
    """Chunks every Markdown document in a directory, in file-name order."""
    return [chunk for path in sorted(docs_dir.glob("*.md")) for chunk in chunk_document(path)]


def embed_chunks(chunks: list[Doc], *, embed: Embed, model: str) -> list[Doc]:
    """Adds an embedding to each chunk, in one request.

    The embedded text is the document source line plus the chunk text, so a
    query such as "BlueHarbor notification deadline" can match on the
    document name as well as the clause wording.

    Args:
        chunks: Output of :func:`chunk_documents`.
        embed: The embedder from ``embeddings.get_embedder``; tests pass a
            stand-in.
        model: The model ``embed`` uses (``EMBEDDING_MODEL``), stored on
            each chunk so a search can tell when the query side uses a
            different model.

    Returns:
        The same chunks, each with ``embedding`` (a list of floats) and
        ``embeddingModel``.
    """
    texts = [f"{chunk['source']}\n{chunk['text']}" for chunk in chunks]
    return [
        {**chunk, "embedding": vector, "embeddingModel": model}
        for chunk, vector in zip(chunks, embed(texts, "document"), strict=True)
    ]


def vector_index_definition(dimensions: int) -> Doc:
    """Returns the Vector Search index definition for ``knowledge``.

    ``dimensions`` is read from the embeddings themselves, not configured, so
    changing ``EMBEDDING_MODEL`` and rerunning ingestion is enough.
    Cosine similarity is used because it does not depend on whether a
    provider normalizes its vectors.

    Args:
        dimensions: Length of one embedding vector.

    Returns:
        The ``definition`` for a ``vectorSearch`` index: one vector field on
        ``embedding`` plus a filter field for each of ``FILTER_FIELDS``.
    """
    return {
        "fields": [
            {"type": "vector", "path": "embedding", "numDimensions": dimensions, "similarity": "cosine"},
            *({"type": "filter", "path": field} for field in FILTER_FIELDS),
        ]
    }