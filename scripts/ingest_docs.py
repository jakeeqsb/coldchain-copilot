"""Load the source documents into ``knowledge`` and build its Vector Search index.

Usage (from the repository root):

    uv run scripts/ingest_docs.py            # chunk, embed, write, index
    uv run scripts/ingest_docs.py --dry-run  # chunk only; no API call, no writes

Needs ``VOYAGE_API_KEY`` and a ``MONGODB_URI`` that supports Vector Search
(Atlas, or the local Atlas container from ``make atlas``). Rerun it after
editing ``docs/`` or changing ``VOYAGE_EMBED_MODEL``.

Steps:
    1. Chunk every document in DOCS_DIR, one chunk per Article or Section.
    2. Embed all chunks with Voyage in one request (input_type=document).
    3. Replace the contents of ``knowledge``.
    4. Create the ``knowledge_vector`` index, or update it when it already
       exists (the dimensions follow the model), then wait until it can be
       queried.

The collection is emptied rather than dropped: dropping it also drops the
search index in the background, and creating an index with the same name
right after can collide with that drop.
"""

from __future__ import annotations

import argparse
import sys
import time

from pymongo.collection import Collection
from pymongo.operations import SearchIndexModel

from coldchain_copilot import db
from coldchain_copilot.config import get_settings
from coldchain_copilot.ingest import VECTOR_INDEX, chunk_documents, embed_chunks, vector_index_definition

INDEX_WAIT_SECONDS = 180
"""How long to wait for the index to become queryable before giving up."""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="chunk only; no API call, no writes")
    args = parser.parse_args(argv)

    settings = get_settings()
    chunks = chunk_documents(settings.docs_dir)
    print(f"Chunked {len(chunks)} sections from {settings.docs_dir}/")
    for chunk in chunks:
        print(f"  {chunk['chunkId']:<45} {chunk['docType']:<9} {len(chunk['text'].split()):>4} words")
    if args.dry_run:
        return 0

    embedded = embed_chunks(chunks, api_key=settings.require_voyage_key(), model=settings.voyage_embed_model)
    dimensions = len(embedded[0]["embedding"])
    print(f"Embedded with {settings.voyage_embed_model} ({dimensions} dimensions)")

    knowledge = db.collection(db.KNOWLEDGE)
    write_chunks(knowledge, embedded)
    print(f"Wrote {len(embedded)} chunks to {settings.db_name}.{db.KNOWLEDGE}")

    ensure_vector_index(knowledge, dimensions)
    wait_until_queryable(knowledge)
    print(f"Index {VECTOR_INDEX} is ready")
    return 0


def write_chunks(knowledge: Collection, chunks: list[dict]) -> None:
    """Replaces every chunk in ``knowledge`` and keeps ``chunkId`` unique."""
    knowledge.delete_many({})
    knowledge.insert_many(chunks)
    knowledge.create_index("chunkId", unique=True)


def ensure_vector_index(knowledge: Collection, dimensions: int) -> None:
    """Creates the Vector Search index, or updates its definition if it exists."""
    definition = vector_index_definition(dimensions)
    if list(knowledge.list_search_indexes(VECTOR_INDEX)):
        knowledge.update_search_index(VECTOR_INDEX, definition)
        print(f"Updated index {VECTOR_INDEX}")
    else:
        knowledge.create_search_index(SearchIndexModel(definition=definition, name=VECTOR_INDEX, type="vectorSearch"))
        print(f"Created index {VECTOR_INDEX}")


def wait_until_queryable(knowledge: Collection) -> None:
    """Polls the index until ``queryable`` is true and the build has finished.

    Raises:
        SystemExit: The index is not ready within ``INDEX_WAIT_SECONDS``.
    """
    deadline = time.monotonic() + INDEX_WAIT_SECONDS
    while time.monotonic() < deadline:
        [index] = list(knowledge.list_search_indexes(VECTOR_INDEX)) or [{}]
        if index.get("queryable") and index.get("status") == "READY":
            return
        time.sleep(2)
    raise SystemExit(f"Index {VECTOR_INDEX} not ready after {INDEX_WAIT_SECONDS}s; check it in Atlas or mongot logs.")


if __name__ == "__main__":
    sys.exit(main())