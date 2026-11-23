"""Unit tests for coldchain_copilot.ingest: chunking and embedding.

No database and no API key: chunking reads the real ``docs/`` folder, and
embedding uses a stand-in Voyage client.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from coldchain_copilot.catalog import doc_chunk_ids
from coldchain_copilot.ingest import (
    FILTER_FIELDS,
    chunk_document,
    chunk_documents,
    embed_chunks,
    vector_index_definition,
)


@pytest.fixture(scope="module")
def chunks(docs_dir: Path) -> list[dict]:
    return chunk_documents(docs_dir)


def by_id(chunks: list[dict]) -> dict[str, dict]:
    return {c["chunkId"]: c for c in chunks}


def test_chunk_ids_match_what_the_seed_validates(chunks, docs_dir: Path) -> None:
    # The seed checks clauses.chunkId against doc_chunk_ids; ingestion must
    # produce exactly those ids or a clause would point at nothing.
    ids = [c["chunkId"] for c in chunks]
    assert len(ids) == len(set(ids))
    assert set(ids) == doc_chunk_ids(docs_dir)


def test_contract_chunk_carries_its_contract_and_text(chunks) -> None:
    art6 = by_id(chunks)["blueharbor-live-fish-v1-article-6"]

    assert art6["docType"] == "contract"
    assert art6["contractId"] == "blueharbor-live-fish"
    assert art6["version"] == "v1"
    assert art6["appliesTo"] == "cargo:live_fish"
    assert art6["source"] == "BlueHarbor Fisheries Live Fish Transport Contract § Article 6"
    assert art6["text"].startswith("Article 6: Notification of Temperature Excursion\n\n")
    assert "15 consecutive minutes" in art6["text"]


def test_chunk_stops_at_the_next_heading(chunks) -> None:
    art6 = by_id(chunks)["blueharbor-live-fish-v1-article-6"]
    assert "Article 7" not in art6["text"]
    assert "##" not in art6["text"]


def test_sop_and_manual_have_no_contract_id(chunks) -> None:
    sop = by_id(chunks)["sop-excursion-response-v1-section-2"]
    assert sop["docType"] == "sop"
    assert "contractId" not in sop
    assert sop["appliesTo"] == "cargo:seafood"


def test_text_before_the_first_heading_is_left_out(tmp_path: Path) -> None:
    doc = tmp_path / "doc.md"
    doc.write_text(
        "---\ndocId: d\ntitle: Demo\ndocType: sop\nversion: v1\n---\n"
        "# Demo\n\nIntro text.\n\n## Section 1: One\n\nFirst.\n\n## Section 2: Two\n\nSecond.\n",
        encoding="utf-8",
    )
    [one, two] = chunk_document(doc)

    assert one["chunkId"] == "d-v1-section-1"
    assert one["text"] == "Section 1: One\n\nFirst."
    assert two["text"] == "Section 2: Two\n\nSecond."


def test_embed_chunks_sends_documents_once_and_keeps_order() -> None:
    calls = []

    class FakeVoyage:
        def embed(self, texts, model, input_type):
            calls.append({"texts": texts, "model": model, "input_type": input_type})
            return SimpleNamespace(embeddings=[[float(i)] * 3 for i in range(len(texts))])

    chunks = [{"chunkId": "a", "source": "Doc § 1", "text": "one"},
              {"chunkId": "b", "source": "Doc § 2", "text": "two"}]
    embedded = embed_chunks(chunks, api_key="unused", model="voyage-4", client=FakeVoyage())

    assert len(calls) == 1
    assert calls[0]["input_type"] == "document"
    assert calls[0]["texts"] == ["Doc § 1\none", "Doc § 2\ntwo"]
    assert [c["embedding"][0] for c in embedded] == [0.0, 1.0]
    assert embedded[0]["embeddingModel"] == "voyage-4"


def test_vector_index_filters_on_fields_every_chunk_can_carry(chunks) -> None:
    definition = vector_index_definition(1024)
    [vector] = [f for f in definition["fields"] if f["type"] == "vector"]
    filters = {f["path"] for f in definition["fields"] if f["type"] == "filter"}

    assert vector == {"type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine"}
    assert filters == set(FILTER_FIELDS)
    # Each filter field is a field chunks actually have (contractId only on contracts).
    assert all(any(field in c for c in chunks) for field in FILTER_FIELDS)