# Demo App Plan

**Answers:** what the demo web app shows, how it talks to the backend, and how far the work has got.
**Read first:** [architecture.md](./architecture.md). **Tracker:** [§ 6 Progress](#6-progress).

A working plan, not a design record. It tracks the work on the `demo-app`
branch. When a part is done, its checkbox in § 6 is ticked in the same commit.
When the app is finished, lasting decisions move to
[`decisions.md`](./decisions.md) and this file is trimmed to a short summary.

## 1. Goal and Scope

The CLI answers questions, but a demo needs to *show* what MongoDB does:
the readings behind an answer, the ontology the engine reads, and the
collections each step touches. The app is a browser front end on the same
agent and engine. It adds no new domain logic.

- **Time box:** one week, four commit points (§ 6).
- **Prototype:** the HTML prototype agreed for the layout and visuals.
- **Out of scope:** recording and replaying runs, rehearsal mode, path
  highlighting between two entities. These may come later.

## 2. Screens

Four tabs. The UI language switches between English and Korean; the
agent answers in the UI language.

| Tab | Shows | Data |
|---|---|---|
| **Operations** | Fleet strip; temperature comparison across the fleet; per-shipment measurement dashboard (temperature with its allowed band, power, door, over-range spans); chat with a streamed answer, the charts for that answer, and the engine trace | Read APIs, ask stream |
| **Ontology** | High level: a graph of object types, cargo classes, event and action types, and their link types. Click a type to drill into an entity graph (shipments, reefers, clauses, parties) with kind, shipment, status, and search filters, plus a relation table | Ontology APIs |
| **Architecture** | The components and MongoDB collections; picking a flow (obligations, briefing, search) lights the path and the collections it reads | Static, plus the last trace |
| **Why MongoDB** | One card per feature used (Time Series, `$setWindowFields`, `$vectorSearch`, `$lookup`, `$graphLookup`, checkpoints) with the real pipeline | Static |

Answer charts are chosen by code from the tool results, not by the LLM
(rule G1). For example, a `find_excursions` result draws the reefer's
temperature with the excursion span highlighted; an `evaluate_obligations`
result draws the deadline timeline.

## 3. Structure

```
coldchain-copilot/
├── src/coldchain_copilot/
│   └── web/              agent layer, like cli.py
│       ├── app.py        FastAPI routes: read APIs and the ask stream
│       └── graph.py      ontology schema and entity graphs from the DB
└── frontend/             React + Vite + TypeScript, d3 for graphs
```

```mermaid
flowchart LR
  browser["Browser (frontend/)"] -->|"GET /api/..."| app["web/app.py"]
  browser -->|"POST /api/ask (SSE)"| app
  app -->|"read APIs"| gateway["tools/gateway.call"]
  app -->|"ontology graphs"| graph["web/graph.py"]
  app -->|"ask"| agent["agent.ask"]
  agent --> gateway
  gateway --> engine["engine and tools"]
  engine --> mongo[("MongoDB")]
  graph --> mongo
```

- `web` sits in the **agent** layer (`test_layers.LAYERS`), the same as
  `cli`. It may import from every layer below.
- Read APIs go through `gateway.call` wherever a tool already returns the
  data, so the browser gets the same JSON, times, and errors the LLM gets.
- `uv run coldchain-copilot-web` serves the API on `localhost:8000`.
  In `frontend/`, `npm install` once, then `npm run dev` serves the app on
  `localhost:5173` and proxies `/api` to the API.

## 4. API

| Method | Path | Returns | Backed by |
|---|---|---|---|
| GET | `/api/fleets/{fleetId}` | Fleet overview (query: `hours`) | `get_fleet_overview` |
| GET | `/api/shipments/{shipmentId}` | Shipment | `get_shipment` |
| GET | `/api/shipments/{shipmentId}/series` | The last 24 hours of the shipment in 5-minute buckets (query: `hours`), with the temperature band and excursions | `timeline_pipeline`, `find_excursions` |
| GET | `/api/shipments/{shipmentId}/obligations` | Engine result with its trace | `evaluate_obligations` |
| GET | `/api/ontology/schema` | Nodes (types, with document counts) and edges (link types and field references) | `web/graph.py` |
| GET | `/api/ontology/graph` | Entity nodes and relation edges | `web/graph.py` |
| POST | `/api/ask` | Server-sent events (§ 5). Body: `question`, `threadId`, `language` | `agent.ask` |

The series reads its buckets with the pipeline of `get_reefer_timeline`,
not the tool: the tool widens buckets to at most 96 to keep the LLM's input
small (45-minute buckets over 72 hours), which would hide a 15-minute
excursion on a chart.

Errors from a tool keep the gateway's `{"error": {"code", "message"}}`
shape; `NOT_FOUND` maps to HTTP 404.

## 5. Ask Stream and Trace

`POST /api/ask` streams one event per step of the agent run:

| Event | Data | When |
|---|---|---|
| `tool_call` | `id`, `name`, `arguments` | The model asks for a tool |
| `tool_result` | `id`, `name`, `result`, `seconds`, `trace` (when present) | The tool returns |
| `token` | `text` | A piece of the answer is written |
| `done` | `answer`, `stats` (as `turn_stats`) | The run ends |
| `error` | `message` | The run fails |

**Trace.** The engine records each of its six steps: name, collections
read, MongoDB feature used, documents returned, and milliseconds. The
trace is for the UI only. The agent's tools node puts it in the
`ToolMessage` artifact, not in the content, so the model never reads it
and the token count is unchanged. A fleet briefing collects the traces of
its shipments into one.

**Language.** `language` is passed in the run context next to `now`. The
llm node adds one line to the system prompt telling the model which
language to answer in.

## 6. Progress

| Day | Part | Status | Commit |
|---|---|---|---|
| 1 | Plan, backend, tests | done | ① |
| 2–3 | Frontend shell, Operations tab | done | ② |
| 4 | Ontology, Architecture, Why MongoDB tabs | done | ③ |
| 5 | UI fixes | not started | ④ |

### Day 1 · Backend

- [x] This plan
- [x] `fastapi` and `uvicorn` dependencies; `web` in `test_layers.LAYERS`
- [x] Read APIs (fleet, shipment, series, obligations)
- [x] Ontology schema and entity graphs from the DB
- [x] Engine trace, kept out of the model's input
- [x] Answer language from the run context
- [x] Ask stream (SSE)
- [x] Tests (293 pass)

### Day 2–3 · Frontend and Operations

- [x] Vite + React + TypeScript shell, tabs, EN/KO switch; `node_modules` and `frontend/dist` in `.gitignore`
- [x] Fleet strip and per-shipment measurement dashboard
- [x] Fleet temperature comparison (one small chart per reefer)
- [x] Chat with streamed answer
- [x] Answer charts chosen from tool results
- [x] Engine trace view

### Day 4 · Other tabs

- [x] Ontology: schema graph, drill-down entity graph, filters, relation table
- [x] Architecture: flows lit from the trace ("last question" lights the path the last answer took)
- [x] Why MongoDB: feature cards, each pipeline checked against the code
- [x] Operations and Ontology stay mounted across tab switches, so the chat survives

### Day 5 · Fixes

- [ ] Fixes found while running the demo questions
