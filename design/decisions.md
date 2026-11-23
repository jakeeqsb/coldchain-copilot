# Design Decisions

## 1. Embed the temperature policy in each reading

Each reading carries its shipment's `minC`, `maxC`, and `policyVersion` in `meta`.

- **Why:** Detection compares a reading with its own bounds, with no join. Past readings keep the thresholds they were recorded under, even if cargo defaults change.
- **Cost:** Small. Readings with the same `meta` share a Time Series bucket, so the snapshot is stored once per bucket.
- **Constraint:** The policy is fixed for the whole shipment and validated before insertion.
- **Note:** MongoDB recommends putting only filter fields in `meta`. The policy is an exception on purpose: it is one-to-one with `shipmentId`, so it never creates extra buckets. Everything else that is not a filter (`cargoType`, `route`) stays out of `meta`.

## 2. Compute incidents at query time

Excursions and anomalies are calculated by aggregation when asked. No incident collection, no background detector.

- **Why:**
  - **Always matches the raw data.** Incidents are derived from readings on every query, so they cannot go stale, duplicate, or drift from the source. Late or corrected readings are reflected automatically.
  - **Rule changes apply instantly.** If the continuity rule or a minimum duration changes, the next query uses it for all history. A stored incident collection would need to be recomputed and reconciled.
  - **Fewer moving parts.** No background job, no processing checkpoints, no "did the detector miss a run?" failure mode.
  - **One question, any window.** The same readings answer "last 24 hours," "this shipment," or "excursions of at least 10 minutes" without precomputing each variant.
  - **Cheap at this scale.** Five reefers over 72 hours is a few dozen buckets per query.
- **Cost:** The work is repeated on every briefing, and there is no record of *when* an incident was first detected. Deadlines are therefore anchored on event times (`eventStart`, `eventEnd`), not on detection time.
- **Revisit when:** Briefings become slow or continuous alerting is needed. Then store incidents while keeping raw readings.

## 3. Turn contract clauses into rules

Each clause is stored as a rule (trigger conditions, action, deadline, dependencies) linked to its source text. The database decides whether it applies; the LLM explains the result.

- **Why:** Same input, same decision. Dependent clauses are found by following references, not by search luck.
- **Missing data:** If the data a clause needs is not collected, the result is "unresolved," never "no obligation."
- **Limit:** Conditions are AND-only on a fixed list of measures. Clauses that do not fit stay as text and are cited, not decided.

## 4. Keep the graph in MongoDB, for now

Relations are existing fields; `$graphLookup` is used only for clause dependencies (1–2 hops), inside the `follow_references` traverser.

- **Why:** The graph is small, shallow, and always starts from a shipment or incident.

  | Relationship | Shape | Handled by |
  |---|---|---|
  | Shipment → contract version | 1 hop | Field `shipments.contractRef` |
  | Cargo class → parent classes | Fixed, rarely changes | Precomputed `ancestors`, matched with `$in` |
  | Clause → clause it depends on | 1–2 hops | `$graphLookup` on `clauses.references` |

- **Where MongoDB stops:** `$graphLookup` follows one connection field recursively within a per-stage memory limit. It has no shortest-path or weighted-path queries, no variable-length pattern matching across several edge types (e.g. Reefer → Compressor model → Part batch → Supplier → other Reefers), no graph algorithms (centrality, community detection), and no RDF/OWL-style reasoning. As depth, fan-out, and edge types grow, each hop becomes another index lookup inside an aggregation stage.
- **Revisit when:** Questions are about the network itself, such as shared part batches across shipments or the most common failure point among depots. Then split the work:
  - MongoDB stays the system of record: sensor history, shipments, documents, embeddings, per-shipment rule evaluation.
  - A graph database holds a projection of relationships (equipment, parts, suppliers, depots) for multi-hop paths and analytics.
  - Shared IDs connect them: the graph answers *which entities*, MongoDB answers *what we know about them*.
- **Swap point:** Traversal is the only behaviour that moves. `rel:references` names its traverser (`follow_references`), and `registry.py` maps the name to a function. Registering a graph-database implementation under that name, or behind a future `graph_engine` chosen by configuration, changes nothing else: definitions, rules, detection, and data stay in MongoDB. The graph database would hold a copy of link values (IDs and link types), kept in sync from MongoDB, and can be rebuilt from it.

## 5. Name functions in the ontology; keep logic in code

The ontology holds names and connections only. Event types name a `detector`, multi-hop link types name a `traverse` function, and action types name a `handler`; `registry.py` maps each name to a Python function. Rule conditions stay data.

- **Why:**
  - **Readable.** A clause → its event type → the detector name → the function, where the MongoDB pipeline is in plain sight. No compiler or binding layer to follow.
  - **Replaceable.** Any behaviour is swapped by registering another function under the same name (the graph swap in § 4 is one case).
  - **One vocabulary for the engine and the agent.** The same named functions can be exposed to the LLM as tools.
- **Rule conditions are data, not functions.** Thresholds and deadlines differ per contract. One comparison function (`rules.py`) evaluates every clause, so a new contract adds documents, not code, and clauses could later be drafted by an LLM and approved by a person.
- **Tried and dropped:** storing MQL in the ontology (couples definitions to MongoDB syntax), and a neutral condition language compiled to MQL with a separate bindings collection (decoupled, but too many moving parts to follow for an MVP).
- **Cost:** A new event type needs one small detector function and a registry entry, not only a document. `catalog.py` checks at seed time that every function name the ontology uses is registered.

## 6. Keep all four kinds of data in one MongoDB cluster

Sensor facts, shipment context, contract text, and rules live in one database.

- **Document model.** A shipment embeds route, policy, and contract reference (read whole, no joins). Readings copy only the policy fields detection needs (Extended Reference pattern), instead of an effective-dated policy table and a temporal join. Clauses of different shapes share one collection (polymorphic documents). New fields need no migration (flexible schema). The MVP does not add JSON Schema validation: seed data is written by the project itself, and readings are checked at ingestion.
- **Time Series.** Buckets and column compression (delta, delta-of-delta, zstd) reduce storage, index size, and cache use. `meta` is a structured document, queried by subfield. Excursions are detected with `$setWindowFields` and `$shift` on the time series itself. Retention is `expireAfterSeconds`; sharding on `meta` fields is available later.
- **Vector Search.** `$vectorSearch` filters by the `contractId` and `version` read from the shipment, so no metadata is copied into a separate store.
- **Accepted limits.** Time Series collections are append-oriented and do not support Change Streams, Database Triggers, or schema validation. Readings are never edited and are validated at ingestion, so these limits do not block the MVP.
## 7. Engineering rules

The code grew feature by feature, and the same knowledge ended up in more than one place. These rules keep it in one place and keep the layers readable. The rule names (A1, B2, ...) are used in reviews and in `design/refactoring.md`.

**The guiding rule (B3): when the code and the ontology both know a fact, the code reads it from the ontology.** The ontology is what a future ontology builder edits, so it has to be what the engine runs.

| Rule | Statement | Checked by |
|---|---|---|
| **A1** | Layers are `common → engine → tools → agent`; a module imports only from its own layer or a lower one. | `tests/unit/test_layers.py` |
| **A2** | One entrance per layer: the engine resolves ontology names through `registry.py`; the LLM reaches data only through `tools/gateway.py`. | `test_layers.py` (agent side) |
| **B1** | Judgment logic (detection, thresholds, condition checks) lives only in the engine layer. Tools resolve scope, call, and shape results. | review |
| **B2** | The ontology holds names only; every name resolves in `registry.py`. | `catalog.py` at seed time |
| **B3** | A fact the ontology states is read from the ontology, not repeated in code. | review |
| **C1** | A new file only for a new responsibility with its own name in the vocabulary: a layer, an ontology concept, an external dependency, or an entry point. Never split a file by size alone. | review |
| **C2** | One name, one meaning. A name already used by the project or a library it builds on is not reused for something else. | review |
| **D1** | Validate at boundaries only: `catalog.py` at seed time, tools at LLM input. Code between them trusts its inputs. | review |
| **D2** | `ToolError` becomes an error dict only in `tools/gateway.py`. | review |
| **D3** | UTC everywhere; KST display strings are made only in `tools/gateway.py`. | review |
| **E1** | Pure logic gets unit tests (no database); functions that touch the database get integration tests. | review |
| **F1** | External model providers (embeddings, chat model) are chosen by configuration, never by code; provider SDKs are imported only in their provider module (`embeddings.py` for embedding SDKs, `agent.py` for LangChain). | `test_layers.py` |
| **F2** | MongoDB is the platform, not a pluggable backend: no storage abstraction over aggregation, `$graphLookup`, or `$vectorSearch`. The only swappable data behaviour is graph traversal, through the traverser registry (§ 4). | review |
| **G1** | The agent is a LangGraph `StateGraph`. What can be computed is a deterministic node; the LLM chooses tools, judges open questions, and writes the answer. | review |

Layer of each module:

| Layer | Modules |
|---|---|
| common | `config`, `db`, `errors`, `embeddings` |
| engine | `ontology`, `detection`, `rules`, `engine`, `registry`, `catalog`, `ingest` |
| tools | `tools/*` |
| agent | `agent` |

`ingest` is in the engine layer, not scripts-only: it defines the `knowledge` chunk shape and the vector index that `tools/documents.py` queries. A new module is added to the `LAYERS` table in `test_layers.py`, so its layer is always a deliberate choice.

- **Why written down:** A rule an agent or a new contributor cannot see is not followed. Rules that a test can check are tested.
- **Revisit when:** The kernel is split from the cold-chain domain into separate packages; the layers then gain a kernel/domain axis.
