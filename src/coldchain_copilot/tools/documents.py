"""Level 3 document tools: the source text behind obligations and procedures.

- ``search_knowledge``: semantic search over contract, SOP, and manual chunks
  with ``$vectorSearch``.
- ``get_clause``: the exact text of one clause or chunk, by id.

The LLM cites these chunks as evidence, so the search must never return a
contract the shipment is not under. With a ``shipment_id`` the filter allows
only that shipment's contract version, plus SOPs and manuals for its cargo
classes. Without one, contracts are excluded altogether. This is the same rule
``ontology.applicable_clauses_filter`` applies to ``clauses``, expressed on
the chunk fields ``ingest.py`` writes.

Queries are embedded here with Voyage (``input_type="query"``), the same model
that embedded the documents (``VOYAGE_EMBED_MODEL``).
"""

from __future__ import annotations

from typing import Any

import voyageai
from pymongo.errors import OperationFailure

from coldchain_copilot import db
from coldchain_copilot.config import get_settings
from coldchain_copilot.errors import ErrorCode, ToolError
from coldchain_copilot.ingest import VECTOR_INDEX
from coldchain_copilot.ontology import cargo_classes
from coldchain_copilot.tools.lookup import get_shipment

Doc = dict[str, Any]

DOC_TYPES = ("contract", "sop", "manual")

CHUNK_FIELDS = {"_id": 0, "chunkId": 1, "source": 1, "docType": 1, "heading": 1, "text": 1}
"""What a chunk shows the LLM: no embedding, no internal fields."""


def search_knowledge(query: str, shipment_id: str | None = None, doc_type: str | None = None, k: int = 4) -> Doc:
    """Finds the chunks most relevant to a question.

    Args:
        query: The question in natural language.
        shipment_id: Restricts contract chunks to this shipment's contract
            version and SOP/manual chunks to its cargo classes.
        doc_type: ``contract``, ``sop``, or ``manual``. Contracts need a
            ``shipment_id``.
        k: Number of chunks to return.

    Returns:
        ``{"contractRef", "results"}``. ``contractRef`` is the shipment's
        contract (None without a shipment). Each result has ``chunkId``,
        ``source`` (for citation), ``docType``, ``heading``, ``text``, and
        ``score``.

    Raises:
        ToolError: ``SCOPE_REQUIRED`` for a contract search without a
            shipment; ``NOT_FOUND`` for an unknown shipment;
            ``EVIDENCE_UNAVAILABLE`` when the index is missing or not ready.
    """
    if doc_type == "contract" and not shipment_id:
        raise ToolError(ErrorCode.SCOPE_REQUIRED, "Contract search needs shipment_id, so only that contract is searched.")

    contract_ref = classes = None
    if shipment_id:
        shipment = get_shipment(shipment_id=shipment_id)
        contract_ref = shipment["contractRef"]
        classes = cargo_classes(shipment["cargoType"])

    settings = get_settings()
    vector = embed_query(query, api_key=settings.require_voyage_key(), model=settings.voyage_embed_model)
    pipeline = search_pipeline(vector, knowledge_filter(contract_ref, classes, doc_type), k)

    try:
        results = list(db.collection(db.KNOWLEDGE).aggregate(pipeline))
    except OperationFailure as exc:
        raise ToolError(
            ErrorCode.EVIDENCE_UNAVAILABLE,
            f"Vector search failed: {exc}. Run scripts/ingest_docs.py on a deployment with Vector Search.",
        ) from exc
    return {"contractRef": contract_ref, "results": results}


def get_clause(clause_id: str | None = None, chunk_id: str | None = None) -> Doc:
    """Returns the exact source text of a clause or chunk, and the clause rule if there is one.

    Use it after ``evaluate_obligations``, which names clauses by id: fetching
    by id is exact, where a semantic search might rank the clause lower.

    Args:
        clause_id: A ``clauses.clauseId``, e.g. ``blueharbor-live-fish-v1-art6``.
        chunk_id: A ``knowledge.chunkId``, e.g. ``blueharbor-live-fish-v1-article-6``.

    Returns:
        The chunk (``chunkId``, ``source``, ``docType``, ``heading``, ``text``)
        plus ``clause``: the structured rule, or None for a chunk no clause
        points at (an Article that sets no condition).

    Raises:
        ToolError: ``SCOPE_REQUIRED`` without an id; ``NOT_FOUND`` for an
            unknown id; ``EVIDENCE_UNAVAILABLE`` when the clause exists but its
            text has not been ingested.
    """
    if clause_id:
        clause = db.collection(db.CLAUSES).find_one({"clauseId": clause_id}, {"_id": 0})
        if clause is None:
            raise ToolError(ErrorCode.NOT_FOUND, f"No clause with id {clause_id}.")
        chunk_id = clause["chunkId"]
    elif chunk_id:
        clause = db.collection(db.CLAUSES).find_one({"chunkId": chunk_id}, {"_id": 0})
    else:
        raise ToolError(ErrorCode.SCOPE_REQUIRED, "Provide clause_id or chunk_id.")

    chunk = db.collection(db.KNOWLEDGE).find_one({"chunkId": chunk_id}, CHUNK_FIELDS)
    if chunk is None:
        if clause is not None:
            raise ToolError(ErrorCode.EVIDENCE_UNAVAILABLE, f"Text of {chunk_id} is not loaded. Run scripts/ingest_docs.py.")
        raise ToolError(ErrorCode.NOT_FOUND, f"No chunk with id {chunk_id}.")
    return {**chunk, "clause": clause}


# ------------------------------------------------------------------- helpers


def knowledge_filter(contract_ref: Doc | None, classes: list[str] | None, doc_type: str | None = None) -> Doc:
    """Builds the ``$vectorSearch`` filter that decides which chunks may be cited.

    With a shipment (``contract_ref`` and ``classes`` given), a chunk is
    allowed when it belongs to that contract version, or when it is an SOP or
    manual chunk for one of the cargo classes. Without a shipment, every
    contract chunk is excluded. ``doc_type`` narrows either case further.

    Kept separate from :func:`search_knowledge` so it can be tested without a
    database or an API key.
    """
    if contract_ref:
        allowed: Doc = {
            "$or": [
                {"contractId": contract_ref["contractId"], "version": contract_ref["version"]},
                {"docType": {"$ne": "contract"}, "appliesTo": {"$in": classes}},
            ]
        }
    else:
        allowed = {"docType": {"$ne": "contract"}}
    return {"$and": [allowed, {"docType": doc_type}]} if doc_type else allowed


def search_pipeline(vector: list[float], filter_: Doc, k: int) -> list[Doc]:
    """Builds the ``$vectorSearch`` aggregation.

    ``numCandidates`` is 20 times ``k`` (at least 100): the approximate
    search looks at that many neighbours before returning the best ``k``.
    The corpus is small, so this is close to exact.
    """
    return [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX,
                "path": "embedding",
                "queryVector": vector,
                "numCandidates": max(100, 20 * k),
                "limit": k,
                "filter": filter_,
            }
        },
        {"$project": {**CHUNK_FIELDS, "score": {"$meta": "vectorSearchScore"}}},
    ]


def embed_query(query: str, *, api_key: str, model: str, client: Any = None) -> list[float]:
    """Embeds one question with Voyage (``input_type="query"``)."""
    client = client or voyageai.Client(api_key=api_key)
    return client.embed([query], model=model, input_type="query").embeddings[0]