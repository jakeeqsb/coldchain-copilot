"""Demo app routes against seeded data (needs MongoDB with scripts/seed.py loaded)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from coldchain_copilot.web import app as web

pytestmark = pytest.mark.integration


@pytest.fixture
def client(mongo_db) -> TestClient:
    return TestClient(web.app)


def test_schema_counts_match_the_entity_graph(client) -> None:
    schema = {n["id"]: n["count"] for n in client.get("/api/ontology/schema").json()["nodes"]}
    entities = client.get("/api/ontology/graph").json()

    for type_ in ("Shipment", "Reefer", "Contract", "Clause", "CargoClass", "EventType", "ActionType", "Party"):
        assert schema[type_] == sum(n["type"] == type_ for n in entities["nodes"]), type_
    ids = {n["id"] for n in entities["nodes"]}
    assert all(e["from"] in ids and e["to"] in ids for e in entities["edges"])


def test_series_covers_the_excursion_in_five_minute_buckets(client) -> None:
    series = client.get("/api/shipments/SHP-102/series").json()

    assert series["bucketMinutes"] == web.SERIES_BUCKET_MINUTES
    assert series["band"]["maxC"] == 4
    assert series["excursions"], "SHP-102 has a seeded excursion"
    assert max(b["maxTemp"] for b in series["buckets"]) > series["band"]["maxC"]


def test_obligations_carry_the_engine_trace(client) -> None:
    trace = client.get("/api/shipments/SHP-102/obligations").json()["trace"]

    assert [s["step"] for s in trace] == ["object", "clauses", "events", "conditions", "references", "actions"]
