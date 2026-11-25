# Refactoring Plan (Stage 6)

A working plan, not a design record. It tracks the refactoring on the
`refactoring` branch. When a step is done, its lasting decisions move to
[`decisions.md`](./decisions.md) or the design document it affects, and its
checkbox here is ticked. When the whole stage is done, this file is trimmed to
a short summary or removed.

## 1. Why

The code works and the tests pass, but it grew step by step as features were
needed. The same knowledge now lives in more than one place, and part of the
ontology is description rather than definition:

- `data/ontology.json` says `Shipment` lives in `shipments` with key
  `shipmentId`, but `engine.py` never reads that; it hard-codes `shipmentId`,
  `departedAt`, and `deliveredAt`. `tools/sensor.py` repeats the same period
  logic in `shipment_period`.
- "A compressor stop or a door opening can cause a temperature excursion" is
  known only inside `detect_temperature_excursion`, which reruns both
  detectors to find a cause. The ontology does not show this relation.
- Link types use `Reefer` and `Contract` as endpoints, but neither is defined
  as an object type, and `catalog.py` does not check link endpoints.
- External services are wired in by hand. `ingest.py` and
  `tools/documents.py` each import `voyageai` and build their own client;
  `agent.py` builds a `ChatOpenAI` directly. Changing the embedding or chat
  model means editing several modules.
- `agent.py` mixes the prompt, the graph, run statistics, and the CLI, and
  sends every question, briefings included, through the same LLM ⇄ tools
  loop (4 LLM calls, ~28 s for a fleet briefing).

The project is also the starting point for a later, generic **ontology
builder and engine** on MongoDB. That builder is only possible if the
ontology actually drives the engine. So this refactoring has two goals:

1. Make the code structured and easy to follow (one place per fact, clear
   layers, documented rules).
2. Make the seam between a generic **kernel** and the cold-chain **domain
   pack** visible, without extracting a framework yet.

## 2. Guiding Principle

> **When the code and the ontology both know the same fact, make the code
> read it from the ontology.**

An analogy: the ontology is the menu, the engine is the kitchen. Today the
kitchen cooks from memory, so changing the menu changes nothing. After the
refactoring the kitchen reads the menu. A builder is a tool for writing menus,
so it needs a kitchen that follows them.

Behaviour does not change. Every expected result in
[`ontology.md` § 6](./ontology.md#6-expected-results-on-seeded-data) stays the
same, and `tests/integration/test_scenarios.py` keeps checking it. Only *who
knows each fact* changes.

```text
        before                                  after
 ┌────────────────────┐               ┌────────────────────┐
 │ ontology.json      │               │ ontology.json      │ ◀── what a builder edits
 │ (half description) │               │ (all executed)     │
 └────────────────────┘               └─────────┬──────────┘
                                                │ read
 ┌────────────────────┐               ┌─────────▼──────────┐
 │ engine / tools     │               │ KERNEL             │ ◀── unchanged across domains
 │ domain knowledge   │      ──▶      │ engine · rules ·   │
 │ spread around      │               │ catalog · registry │
 └────────────────────┘               └─────────┬──────────┘
                                                │ called by name
                                      ┌─────────▼──────────┐
                                      │ DOMAIN functions   │ ◀── new domain = write these
                                      │ detect_*, handlers │
                                      └────────────────────┘
```

**Done when** the answer to "what must change to run a different domain?" is
"JSON files, a few detectors, and documents", with no engine code in the list.

## 3. Engineering Rules

Confirmed in step 0 and recorded in [`decisions.md` § 7](./decisions.md#7-engineering-rules),
which is the only copy. Rule names (A1, B3, F1, ...) are used below.

## 4. Steps

Each step is one reviewable change with its tests, and ends with a table of
`file | path | what changed`.

### Step 0. Clean-up and rules (stage 5 leftovers)

- [x] `SYSTEM_PROMPT` in `agent.py`: the agent is read-only (never offers to
      send, notify, or change); "fact vs. condition" uses the clause `basis`
      (actual vs. required); cite documents, never tool names.
- [x] README: Quick Start uses `scripts/seed.py`, `scripts/ingest_docs.py`,
      `coldchain-copilot -q`; requirements say only "MongoDB with Vector
      Search, reachable at `MONGODB_URI`" (how to run it is up to the user);
      Project Structure lists `agent.py`, `ingest.py`, and the 9 tools; remove
      the link to the missing `scaling.md`. The variable table is finished in
      step 1, when the names change.
- [x] README.ko.md: not restored now; rewrite after stage 6.
- [x] `decisions.md` § 7: engineering rules (rules A–G).
- [x] `tests/unit/test_layers.py`: parse imports with `ast`, fail on an
      upward import (A1). The provider-SDK check (F1) is added in step 1.
- [x] Demo questions, once `.env` exists (compare with expected results):
  - RF-03이 지금 싣고 있는 화물과 허용 온도 범위는?
  - FLEET-01에서 온도 이탈이 있었던 컨테이너와 원인은?
  - SHP-102 계약에서 온도 이탈이 나면 누구에게 언제까지 통보해야 해?
  - FLEET-01 현황 브리핑해줘
  - SHP-102는 Article 8이 왜 안 걸렸고, Article 6 다음엔 뭘 해야 해?

Result (2026-11-23). All five answers match the expected engine results,
with "fact vs. condition" from the basis ("24 min ≥ 15 min", "24 min < 30 min")
and no tool names cited.

FLEET-01 briefing, three runs per prompt:

| Prompt | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Before step 0 | 28.0 s · 4 LLM · `get_clause` ×11 | 26.7 s · 4 LLM · ×11 | 20.6 s · 3 LLM · ×0 |
| After step 0 | 30.9 s · 4 LLM · ×10 | 28.4 s · 4 LLM · ×11 | 36.0 s · 4 LLM · ×12 |

The prompt change does not explain the latency: with either prompt the model
usually calls `get_clause` ~11 times (~35k input tokens, ~28 s), and sometimes
skips it (~19 s). An earlier single-run comparison (18.7 s before, 28.9 s
after) was one such lucky run, not an effect. The cause is the one step 5 (B)
addresses: `evaluate_obligations` returns only `chunkId`, so quoting a clause
takes a `get_clause` round trip, and the results pile up in the context.
Compare several runs, not one, when measuring step 5.

Noted for later: clauses that mean "any occurrence" are written as
`consecutiveMinutes ≥ 1`, which reads oddly in a briefing ("18 min ≥ 1 min").

### Step 1. Model providers chosen by configuration

```text
 .env                                 common layer                       callers
 EMBEDDING_PROVIDER=voyage            embeddings.py                      ingest.py
 EMBEDDING_MODEL=voyage-4      ──▶     EMBEDDERS = {               ──▶   tools/documents.py
                                         "voyage": voyage_embedder,      (no SDK import;
                                         "openai": openai_embedder,       call embed(texts, kind))
                                       }
                                       get_embedder(settings) -> embed

 LLM_MODEL=openai:gpt-6.1-terra ──▶   init_chat_model(...)         ──▶   agent.build_graph(model, ...)
 LLM_REASONING_EFFORT=low              (LangChain's standard factory)
```

- [x] `embeddings.py` (new file; rule C1: a new external dependency): an
      `Embed` signature `(texts, kind) -> vectors` with `kind` in
      `document` / `query`, one small factory per provider, and an
      `EMBEDDERS` registry selected by `EMBEDDING_PROVIDER`. Functions, no
      class hierarchy.
- [x] `ingest.embed_chunks` and `tools/documents.embed_query` take an
      `Embed` instead of building a Voyage client; tests pass a fake one.
- [x] Chat model from `init_chat_model(settings.llm_model, ...)`; no
      `ChatOpenAI` import. Add `langchain` as a direct dependency (it is
      transitive today). Embeddings keep their own registry so the engine
      layer (`ingest`) does not depend on LangChain, and Voyage's
      `input_type` stays explicit.
- [x] Rename variables (breaking, done now while no `.env` exists):

      | Old | New |
      |---|---|
      | `VOYAGE_EMBED_MODEL` | `EMBEDDING_MODEL` (+ `EMBEDDING_PROVIDER`, default `voyage`) |
      | `OPENAI_MODEL` | `LLM_MODEL` as `provider:model`, default `openai:gpt-6.1-terra` |
      | `OPENAI_REASONING_EFFORT` | `LLM_REASONING_EFFORT` |

      API keys keep their provider names (`VOYAGE_API_KEY`,
      `OPENAI_API_KEY`), because the SDKs read them under those names.
      Update `config.py`, `.env.example`, and the README variable table.
- [x] Model mismatch guard: each chunk already stores `embeddingModel`.
      `search_knowledge` returns `EVIDENCE_UNAVAILABLE` ("re-run
      ingest_docs.py") when it differs from the configured model, instead of
      comparing vectors from two models.
- [x] `test_layers.py`: provider SDKs imported only where F1 allows.

Result (2026-11-23). Checked live: ingestion through the injected Voyage
embedder; a search with `EMBEDDING_MODEL=voyage-3.5` against `voyage-4`
vectors returns `EVIDENCE_UNAVAILABLE`; the OpenAI embedder returns
1536-dimension vectors; the agent answers through `init_chat_model`.
`test_layers.py` fails when an SDK is imported outside its module.

### Step 2. Load objects through the ontology

Fixes the duplicated shipment period.

```text
 ontology.json                         engine.py
 ┌──────────────────────────────┐      ┌───────────────────────────────────┐
 │ Shipment                     │ ───▶ │ load_object("Shipment", id, now)  │
 │  collection: "shipments"     │ read │  → (document, start, end)         │
 │  key: "shipmentId"           │      └──────────┬────────────────────────┘
 │  period: {start:"departedAt",│                 │ the only caller path
 │           end:"deliveredAt"} │       ┌─────────┴─────────┐
 └──────────────────────────────┘    engine step 1     tools/sensor.resolve
```

- [x] Add `period` to the `Shipment` object type.
- [x] `engine.load_object(object_type, object_id, now)` reads `collection`,
      `key`, and `period` from the ontology.
- [x] `evaluate_shipment` step 1 and `tools/sensor.resolve` use it; remove
      `sensor.shipment_period`.
- [x] Design check: the same function must fit a `Lot` object in another
      domain (§ 6). Not implemented here.

Result (2026-11-23). `engine.load_object` is the only code that reads a
shipment for a period; `tests/integration/test_scenarios.py` checks that the
engine and `sensor.resolve` return the same period, and `test_engine.py`
checks `object_period` with another object type's fields (a pharma `Lot`).
The "not found" message is now one message for both callers. Left for
step 4: `catalog.py` does not yet check that `period` names properties of
the object type. Left as is: `tools/lookup.get_shipment` still queries
`shipments` directly, because finding a reefer's active shipment is a
different query (not in this step's scope).

### Step 3. Causes as ontology data

Fixes the duplicated aggregations and makes the causal relation visible.

```text
 now                                           after
 engine                                        ontology.json
  ├─ detect_temperature_excursion                event:temperature_excursion
  │    ├─ detect_compressor_stop   (1st)           causes: [event:compressor_stop,
  │    └─ detect_door_opening      (1st)                    event:door_opening]
  ├─ detect_compressor_stop        (2nd)       engine
  └─ ...                                         1. collect event types (clauses + causes)
                                                 2. run each detector once
                                                 3. attach_causes by time overlap
```

- [x] Add `causes` (ordered = priority) to `event:temperature_excursion`.
- [x] One engine-layer function runs the needed detectors once per
      evaluation and attaches causes; `engine` and `find_excursions` both use
      it. `detect_temperature_excursion` no longer calls other detectors.
- [x] `catalog.py` checks that every `causes` entry is an event type.

The cost saved is small (tools take ~0.1 s in total). The point is that the
relation becomes data a builder can show and edit.

Result (2026-11-24). `engine.detect_events(event_ids, scope, start, end)`
runs each detector once; cause detectors run only when the event type has
events, as before. `get_fleet_overview` needs only the excursion count, so
it calls the detector directly and looks up no causes (two aggregations
fewer, same count). Engine results for all five shipments and
`find_excursions` events are byte-identical to the previous commit.
`test_scenarios.py` checks that one evaluation runs each detector once;
the cause checks moved there from `test_detection_db.py`, because a
detector alone no longer sets `cause`.

### Step 4. Stronger catalog checks

- [x] Define `Reefer` and `Contract` object types.
- [x] `catalog.py` checks that every link type's `from` and `to` is an object
      type or a class root.
- [x] `catalog.py` checks that `period` names properties of the object type
      (left from step 2).
- [x] Note in `ontology.md`: `catalog.py` is the ontology's grammar checker;
      a builder reuses it to validate LLM-drafted rules.

Result (2026-11-24). Run on the previous ontology, the new checks report
five broken link ends: `Reefer` and `Contract` were never defined, and
`CargoClass` and `EventType` named nothing. `Reefer` and `Contract` are now
object types without a collection (nothing loads them). A link end may be an
object type, a class root (`cargo:seafood`), or a kind of ontology document
(`eventType`); `rel:appliesTo` and `rel:triggeredBy` now point to those.
Engine results are unchanged. Left as is: property types such as
`cargoType: "CargoClass"` are not checked; only link ends were in scope.

### Step 5. Agent on LangGraph practice, and briefing latency

Measured: fleet briefing 28–30 s, 4 LLM calls, ~36k input tokens, tools
0.1 s in total; `get_clause` is called ~11 times to quote clause text.
Single-shipment questions take ~11 s and 12k tokens. Reasoning effort low
vs. medium barely changed this: the cost is sequential round trips and
accumulated tool output.

The agent stays a `StateGraph` (not LangChain's prebuilt `create_agent`):
the builder direction needs deterministic nodes mixed with LLM nodes, which
a single prebuilt loop does not give.

```text
 now (every question takes the same loop)
   question → llm ⇄ tools ⇄ llm ⇄ tools ⇄ llm → answer        4 LLM calls, ~28 s

 after (briefings take a deterministic path)
   question ─▶ route ─┬─ other question ─▶ llm ⇄ tools → answer   (as today)
                      └─ briefing ───────▶ collect ─▶ llm → answer
                                           (deterministic node:
                                            find_excursions,
                                            evaluate_obligations × N,
                                            clause text via $lookup)
```

- [x] (B) `evaluate_obligations` joins `knowledge` by `chunkId` with
      `$lookup` and returns each clause's heading and text, so `get_clause`
      is no longer needed to quote it.
- [x] (C) Drop fields the LLM does not use from the engine output.

Result 5.1 (2026-11-24). Every result carries `source`; triggered and
unresolved results also carry `text` (13 of 42 across the five shipments).
The gateway drops `actions`, which repeated the triggered results; the
engine still produces them for handlers. The prompt says to quote that text
and use `get_clause` only for other clauses. Three runs each, before → after:

| Question | Time (s) | LLM calls | Input tokens | `get_clause` |
|---|---|---|---|---|
| FLEET-01 briefing | 38.0 / 33.6 / 31.9 → 27.6 / 26.2 / 25.4 | 4 → 3 | ~35k → ~18k | 6–11 → 0 |
| SHP-102 notice duty | 12.0 / 9.6 / 10.0 → 8.1 / 8.4 / 8.4 | 3 → 2 | 11.7k → 6.3k | 1 → 0 |

Citations changed from chunk ids (`[blueharbor-live-fish-v1-article-6]`) to
document names (`[BlueHarbor 계약 제6조]`).
- [x] Briefing path: a `route` node (start simple: a CLI flag or a keyword
      rule; an LLM classifier only if needed) and a deterministic `collect`
      node that calls the gateway functions directly, then one `llm` call to
      write the briefing (rule G1). Done as a tool instead; see result 5.4.

Result 5.4 (2026-11-24). Tried first as planned, with an LLM `route` node
(structured output) and a `collect` node. Measured per node: `route` took
4–5 s, because one call to this model costs 3–4 s however short the
answer. Briefings got a little faster (~26 → ~22 s), but every other
question paid the route call (SHP-102: ~8 → ~15 s). Dropped. Instead,
`collect_fleet_briefing(fleet_id)` (`tools/briefing.py`, level 4) makes the
same calls in code in a fixed order, and the model chooses it in the call
it makes anyway: no extra call, the graph is unchanged. `evaluate_obligations`
moved to the same module (it was in the gateway; the briefing tool needs
it, and the gateway imports the tools, not the other way round).

Writing the briefing is now the floor: one call producing ~1,200 tokens
takes ~18 s, whatever happens before it.

Interleaved runs, last commit (5.3) and this code at the same time (API
latency varied a lot: the unchanged SHP-102 path ranged 7–21 s):

| FLEET-01 briefing | Time (s) | LLM calls | Input tokens |
|---|---|---|---|
| before (5.3) | 38.4 / 38.2 / 29.0 | 4 / 4 / 3 | 30k / 30k / 19k |
| after | 23.9 / 29.9 / 24.2 | 2 / 2 / 2 | 15.4k every run |

The model no longer chooses how many calls to make, so the cost of a
briefing is the same on every run.
- [x] Runtime context: pass `now` and the display time zone through
      `context_schema` instead of calling `datetime.now()` inside the node,
      so graph tests are deterministic.

Result 5.3. `agent.Context(now)` is the graph's `context_schema`; `ask`
takes `now` (default: the clock) and the `llm` node reads
`runtime.context.now`. Only `now` is passed: the display zone stays
`gateway.DISPLAY_TZ`, the one zone every tool's display strings use (rule
D3), so the prompt and the tools cannot disagree.
- [x] Context size: trim large tool results from earlier turns of a thread
      (`trim_messages` or a short summary) before each model call.

Result 5.5. `agent.recent_tool_results` sends the model tool results from
the last three questions only; older ones become a short "omitted, call
again if needed" note. Not `trim_messages`: it drops whole messages by
token count, which can split a tool call from its result, and the provider
rejects that. Questions, answers, and the saved thread are kept in full.
One thread of four questions, without and with the limit:

| Question | Input tokens, no limit → limit 3 | Time (s) |
|---|---|---|
| 1. FLEET-01 briefing | 15.4k → 15.4k | 22.7 → 25.4 |
| 2. RF-02 compressor, how long? | 14.5k → 14.5k (no tool call) | 2.9 → 3.2 |
| 3. SHP-104 power change? | 14.6k → 14.6k (no tool call) | 2.9 → 2.8 |
| 4. FLEET-01 briefing again | 40.6k → 18.0k | 20.0 → 20.2 |

Follow-ups still answer from recent results without a tool call; a long
thread no longer grows by every result it ever fetched.
- [x] Split by entry point (rule C1): `agent.py` keeps the prompt, state,
      and graph; `cli.py` takes `main`, `show`, and the stats helpers. Rename
      our `create_agent` (it clashes with `langchain.agents.create_agent`,
      rule C2), for example to `build_agent`.

Result 5.2. `agent.py` keeps `ask` and `turn_stats` too: running and
measuring a question is the agent's job, and keeping them there means
`agent.py` never imports `cli.py`. `cli.py` has `main`, `show`, and
`format_stats` (display only). The `coldchain-copilot` command now points to
`cli:main`. No behaviour changed.
- [x] (D) Token streaming with `stream_mode="messages"` in the CLI; LangSmith
      tracing switched on by environment variables only.

Result 5.6. `ask` streams `updates` and `messages` together and passes the
`llm` node's text to `on_token`; the CLI prints it as it comes and adds
`first text` to the stats line. In the runs above, the briefing's first text
appeared after 4–16 s instead of the whole 24–30 s. LangSmith needs no code:
`.env` is loaded into the environment, and LangChain reads
`LANGSMITH_TRACING` and `LANGSMITH_API_KEY` from there (see `.env.example`).
Done before 5.5 at the user's request.
- [x] Measure before and after with `turn_stats`; record the numbers here.
      (Recorded under each result above.)

Requires `.env` (OpenAI and Voyage keys) to measure.

### Step 6. Documents

- [x] Chunking strategy in `ontology.md` or `entities.md`: structure-based,
      one chunk per Article/Section. Why: clause = judgment unit = citation
      unit; `chunkId` joins `clauses` and `knowledge`; the documents are
      short; cross-references are followed with `$graphLookup`, not chunk
      overlap. Limits: long clauses → parent-child chunks; nested numbering;
      documents without headings → fixed-size fallback.
- [x] `interfaces.md`: remove "(stage 4)" markers; 10 tools.
- [x] Kernel/domain map (§ 5) moved into `decisions.md` or `ontology.md`.
- [x] Replace key ASCII diagrams in `ontology.md` and `interfaces.md` with
      Mermaid where it reads better.

Result 6 (2026-11-25). Documents are split by the reader's question, each
opening with the question it answers and what to read first:
`architecture.md` (new: the entities, the components, where the ontology
meets the code, layers, kernel and domain; the kernel map moved here rather
than to `decisions.md` or `ontology.md`, because it describes the code's
structure), `walkthrough.md` (new: one question from the CLI to MongoDB and
back), and the existing reference documents. Diagrams are Mermaid, in
English, with one claim each; the overview at the top of `architecture.md`
is a draw.io SVG (`design/images/architecture.drawio.svg`), editable in
draw.io. The chunking strategy is in `entities.md`, whose `knowledge`
schema was also out of date (`title` / `section` → `source` / `heading`).
Long reference tables are folded with `<details>`. The cargo tree in
`ontology.md` and the briefing template in `interfaces.md` stay as text:
they are a tree and a format, which text shows better. Package
restructuring (kernel / domain) stays out of scope until the builder.

### Out of scope

- A `graph_engine` abstraction for `dependent_clauses` (one implementation
  only; revisit when a graph database is added).
- Splitting the package into kernel and domain packages (wait for a second
  domain).
- Repository rename to `coldchain-copilot` (done on GitHub, not in code).
- A storage abstraction over MongoDB (rule F2).
- LangChain's prebuilt `create_agent` (rule G1: the agent stays a
  `StateGraph`).

## 5. Kernel / Domain Map

Moved to [architecture.md, Kernel and domain](./architecture.md#kernel-and-domain) in step 6, updated for steps 2–5.

## 6. Direction: the Ontology Builder

Not built in this stage. Recorded so each step can be checked against it.

```text
 Phase 0  This refactoring. Cold chain is the reference implementation;
          the ontology drives more of the engine; kernel/domain map written.
 Phase 1  Kernel + a second domain. The meta-model (objectType, linkType,
          eventType, actionType, rule) defined as MongoDB documents with
          $jsonSchema; catalog becomes a generic validator. A second domain
          runs with no kernel code change.
 Phase 2  Builder (authoring).
          ① infer objectType drafts from existing collections ($sample)
          ② documents → LLM drafts rules in the ontology's vocabulary →
             catalog check → human approval (review.status)
          ③ generate $jsonSchema validators and indexes from object types
 Phase 3  Runtime. LLM tools generated from the ontology (objectType → get_X,
          eventType → find_X); Change Streams for reactive evaluation
          (not on Time Series); optional stored incidents; deep traversal
          projected to a graph database behind the traverser registry.
```

**Scope: an operational ontology** (objects, links, events, actions, rules),
not an OWL/RDF semantic-web editor. Reasoners and triple stores own that
space; MongoDB's strength is keeping data, meaning, and execution together.

**MongoDB's role:** object instances are documents; the meta-model sits next
to the data; detectors are aggregations; Vector Search and Time Series live in
the same cluster; schema inference and `$jsonSchema` connect definitions and
validation. A graph database is added only for deep traversal and graph
algorithms.

### Design check: pharmaceutical cold chain

A near domain (same reefers and sensors, different rules) used as an
imaginary second customer while designing steps 2–4. Illustrative values
only.

| Part | Reused | New in the domain pack |
|---|---|---|
| Classes | — | `product:vaccine` → `product:mrna_vaccine`, `product:antiviral` |
| Objects, links | `Shipment`, `Reefer` | `Lot` (inShipment, ofProduct), `Product`, `QualityAgreement` |
| Detectors | excursion, door, compressor (`run_pipeline`) | MKT (mean kinetic temperature), lot excursion budget |
| Actions | `notify`, `inspect`, `report` | `quarantine` |
| Documents | ingest, search | quality agreements, GDP guidance, stability data |

Where today's kernel would stop, and what the builder needs:

| # | Gap | Today | Needed |
|---|---|---|---|
| 1 | The judged object is a `Lot` | only `evaluate_shipment` | `evaluate(object_type, id)` (extends step 2) |
| 2 | Totals across shipments | one shipment period | Lot → Shipments → Readings (2 hops, `$lookup`) |
| 3 | Quarantine changes state | handlers only write a briefing item | state change after human approval; the agent stays read-only |
| 4 | Audit trail is mandatory | evaluations are not stored (`decisions.md` § 2) | stored evaluation records with data window, rule and ontology version, approver; a per-domain option |

Gap 4 reverses a cold-chain decision, which a single domain could never show.
The pharmaceutical domain is a weak test of generality (it is still a cold
chain), so a clearly different domain (for example insurance claims or
equipment maintenance) should follow it in phase 1.

## 7. Progress

| Step | Status | Notes |
|---|---|---|
| 0 | done | clean-up and rules; latency unchanged (see step 0 result) |
| 1 | done | model providers |
| 2 | done | objects through the ontology |
| 3 | done | causes as data |
| 4 | done | catalog checks |
| 5 | done | agent and latency (5.1–5.6) |
| 6 | done | documents |
