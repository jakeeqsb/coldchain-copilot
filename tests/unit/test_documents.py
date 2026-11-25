"""Unit tests for coldchain_copilot.tools.documents: filters, pipeline, query embedding.

No database and no API key. The search itself runs in
tests/integration/test_documents_db.py.
"""

from __future__ import annotations

import pytest

from coldchain_copilot.errors import ToolError
from coldchain_copilot.ingest import VECTOR_INDEX
from coldchain_copilot.tools import documents

BLUEHARBOR = {"contractId": "blueharbor-live-fish", "version": "v1"}
LIVE_FISH = ["cargo:live_fish", "cargo:live_seafood", "cargo:seafood"]


def matches(chunk: dict, filter_: dict) -> bool:
    """Evaluates the small filter subset documents.py uses, in Python."""
    for key, cond in filter_.items():
        if key == "$and":
            if not all(matches(chunk, f) for f in cond):
                return False
        elif key == "$or":
            if not any(matches(chunk, f) for f in cond):
                return False
        elif isinstance(cond, dict) and "$ne" in cond:
            if chunk.get(key) == cond["$ne"]:
                return False
        elif isinstance(cond, dict) and "$in" in cond:
            if chunk.get(key) not in cond["$in"]:
                return False
        elif chunk.get(key) != cond:
            return False
    return True


CHUNKS = {
    "own contract": {"docType": "contract", "contractId": "blueharbor-live-fish", "version": "v1",
                     "appliesTo": "cargo:live_fish"},
    "own contract, other version": {"docType": "contract", "contractId": "blueharbor-live-fish", "version": "v2",
                                    "appliesTo": "cargo:live_fish"},
    "other shipper, same cargo": {"docType": "contract", "contractId": "other-live-fish", "version": "v1",
                                  "appliesTo": "cargo:live_fish"},
    "seafood sop": {"docType": "sop", "appliesTo": "cargo:seafood"},
    "seafood manual": {"docType": "manual", "appliesTo": "cargo:seafood"},
    "dairy sop": {"docType": "sop", "appliesTo": "cargo:dairy"},
}


def allowed(filter_: dict) -> set[str]:
    return {name for name, chunk in CHUNKS.items() if matches(chunk, filter_)}


# --- knowledge_filter ----------------------------------------------------------


def test_with_shipment_only_its_contract_and_its_cargo_procedures() -> None:
    assert allowed(documents.knowledge_filter(BLUEHARBOR, LIVE_FISH)) == {
        "own contract", "seafood sop", "seafood manual",
    }


def test_without_shipment_no_contract_at_all() -> None:
    assert allowed(documents.knowledge_filter(None, None)) == {"seafood sop", "seafood manual", "dairy sop"}


def test_doc_type_narrows_further() -> None:
    assert allowed(documents.knowledge_filter(BLUEHARBOR, LIVE_FISH, "sop")) == {"seafood sop"}
    assert allowed(documents.knowledge_filter(BLUEHARBOR, LIVE_FISH, "contract")) == {"own contract"}


def test_contract_search_without_shipment_is_rejected() -> None:
    with pytest.raises(ToolError) as exc_info:
        documents.search_knowledge("notification deadline", doc_type="contract")
    assert exc_info.value.code == "SCOPE_REQUIRED"


# --- search_pipeline -----------------------------------------------------------


def test_pipeline_uses_the_ingested_index_and_hides_embeddings() -> None:
    [search, project] = documents.search_pipeline([0.1, 0.2], {"docType": "sop"}, k=4)

    assert search["$vectorSearch"]["index"] == VECTOR_INDEX
    assert search["$vectorSearch"]["limit"] == 4
    assert search["$vectorSearch"]["numCandidates"] == 100
    assert search["$vectorSearch"]["filter"] == {"docType": "sop"}
    assert "embedding" not in project["$project"]
    assert project["$project"]["score"] == {"$meta": "vectorSearchScore"}


def test_more_results_widen_candidates() -> None:
    [search, _] = documents.search_pipeline([0.1], {}, k=10)
    assert search["$vectorSearch"]["numCandidates"] == 200


# --- embed_query / check_embedding_model / get_clause ------------------------


def test_query_is_embedded_as_a_query() -> None:
    seen = {}

    def fake_embed(texts, kind):
        seen.update(texts=texts, kind=kind)
        return [[0.5, 0.5]]

    vector = documents.embed_query("who do we notify?", fake_embed)

    assert vector == [0.5, 0.5]
    assert seen == {"texts": ["who do we notify?"], "kind": "query"}


@pytest.mark.parametrize("stored", [["voyage-4"], []])
def test_matching_or_empty_knowledge_allows_the_search(stored) -> None:
    documents.check_embedding_model(stored, "voyage-4")


@pytest.mark.parametrize("stored", [["voyage-3"], ["voyage-3", "voyage-4"]])
def test_vectors_from_another_model_stop_the_search(stored) -> None:
    with pytest.raises(ToolError) as exc:
        documents.check_embedding_model(stored, "voyage-4")
    assert exc.value.code == "EVIDENCE_UNAVAILABLE"
    assert "ingest_docs.py" in exc.value.message


def test_get_clause_needs_an_id() -> None:
    with pytest.raises(ToolError) as exc_info:
        documents.get_clause()
    assert exc_info.value.code == "SCOPE_REQUIRED"