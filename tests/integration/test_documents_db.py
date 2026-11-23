"""Document tools against ingested data.

Needs MongoDB with Vector Search, scripts/seed.py and scripts/ingest_docs.py
loaded, and VOYAGE_API_KEY for query embedding. Skips otherwise.
"""

from __future__ import annotations

import pytest

from coldchain_copilot import db
from coldchain_copilot.config import get_settings
from coldchain_copilot.errors import ToolError
from coldchain_copilot.tools.documents import get_clause, search_knowledge

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def ingested(mongo_db):
    if db.collection(db.KNOWLEDGE).estimated_document_count() == 0:
        pytest.skip("knowledge is empty: run scripts/ingest_docs.py")


@pytest.fixture(scope="module")
def voyage(ingested):
    if not get_settings().voyage_api_key:
        pytest.skip("VOYAGE_API_KEY not set")


def test_search_finds_the_notification_article(voyage) -> None:
    result = search_knowledge("Who must be notified, and how fast, when the temperature exceeds 4°C?",
                              shipment_id="SHP-102")

    assert result["contractRef"] == {"contractId": "blueharbor-live-fish", "version": "v1"}
    assert result["results"][0]["chunkId"] == "blueharbor-live-fish-v1-article-6"
    assert all("embedding" not in r for r in result["results"])


def test_search_never_cites_another_shippers_contract(voyage) -> None:
    results = search_knowledge("delivery refusal and compensation", shipment_id="SHP-103", k=10)["results"]
    contracts = [r["chunkId"] for r in results if r["docType"] == "contract"]
    assert contracts and all(c.startswith("oceanpeak-tuna-v1-") for c in contracts)


def test_search_without_shipment_has_no_contracts(voyage) -> None:
    results = search_knowledge("what to do when the compressor stops", k=10)["results"]
    assert results and all(r["docType"] != "contract" for r in results)


def test_get_clause_by_clause_id(ingested) -> None:
    result = get_clause(clause_id="blueharbor-live-fish-v1-art6")

    assert result["chunkId"] == "blueharbor-live-fish-v1-article-6"
    assert "15 consecutive minutes" in result["text"]
    assert result["clause"]["action"] == {"type": "notify", "party": "shipper.qa"}


def test_get_clause_for_a_chunk_without_a_rule(ingested) -> None:
    result = get_clause(chunk_id="blueharbor-live-fish-v1-article-9")
    assert result["clause"] is None
    assert result["source"].endswith("§ Article 9")


@pytest.mark.parametrize("kwargs", [{"clause_id": "nope-v1-art1"}, {"chunk_id": "nope-v1-article-1"}])
def test_unknown_ids_are_not_found(ingested, kwargs: dict) -> None:
    with pytest.raises(ToolError) as exc_info:
        get_clause(**kwargs)
    assert exc_info.value.code == "NOT_FOUND"