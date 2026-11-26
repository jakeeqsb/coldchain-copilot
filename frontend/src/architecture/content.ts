// What the Architecture tab draws and says: the components, the MongoDB
// collections, the wires between them, and the flows that light them up.

import type { Language } from "../i18n";

/** x, y, width, icon, title, subtitle. Every card is 66 high. */
export const CARDS: Record<string, [number, number, number, string, string, string]> = {
  ui: [40, 50, 200, "user", "Operator UI", "frontend/ · cli.py"],
  agent: [330, 50, 220, "agent", "Agent", "agent.py · LangGraph"],
  llm: [650, 50, 220, "llm", "Chat model", "LLM_MODEL (.env)"],
  gateway: [330, 180, 220, "gate", "Gateway", "tools/gateway.py"],
  tools: [650, 180, 300, "tools", "Tools ×10", "lookup · sensor · documents · briefing"],
  detection: [40, 320, 190, "det", "Detection", "detection.py"],
  registry: [290, 320, 180, "reg", "Registry", "registry.py"],
  engine: [530, 320, 200, "engine", "Engine", "engine.py · 6 steps"],
  rules: [770, 320, 150, "rules", "Rules", "rules.py"],
};

/** x of the box, name, subtitle. */
export const COLLECTIONS: Record<string, [number, string, string]> = {
  readings: [60, "readings", "time series"],
  shipments: [205, "shipments", "documents"],
  ontology: [350, "ontology", "34 definitions"],
  clauses: [495, "clauses", "15 rules"],
  knowledge: [640, "knowledge", "vector index"],
  checkpoints: [785, "checkpoints", "agent state"],
};

const cx = (k: string) => COLLECTIONS[k][0] + 65;

export const ICONS: Record<string, string> = {
  user: "M10 9a4 4 0 1 0 0-.01M3 22c1-4 4-6 7-6s6 2 7 6",
  agent: "M4 6h16v10H4zM8 20h8M12 16v4M8 10h.01M16 10h.01",
  llm: "M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z",
  gate: "M4 20V8l8-5 8 5v12M9 20v-6h6v6",
  tools: "M14 6l4 4-9 9H5v-4zM12 8l4 4",
  engine: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  reg: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h4",
  det: "M3 17l5-6 4 4 6-8 3 3",
  rules: "M6 4h12M12 4v16M4 12l4-6 4 6zM12 12l4-6 4 6z",
};

export type Wire = { d: string; label: string; db?: boolean; at?: [number, number, "start" | "middle" | "end"] };

export const WIRES: Record<string, Wire> = {
  q: { d: "M240,83 L328,83", label: "question" },
  llm: { d: "M550,83 L648,83", label: "tool call / answer" },
  gw: { d: "M440,116 L440,178", label: "tool call" },
  tools: { d: "M550,213 L648,213", label: "dispatch" },
  eng: { d: "M800,246 L800,283 L630,283 L630,318", label: "evaluate" },
  sensor: { d: "M680,246 L680,268 L135,268 L135,318", label: "sensor tools", at: [300, 262, "middle"] },
  reg: { d: "M530,353 L472,353", label: "name→fn" },
  det: { d: "M290,353 L232,353", label: "detector" },
  rules: { d: "M730,353 L768,353", label: "compare", at: [750, 314, "middle"] },
  d_read: { d: "M135,386 L135,498", label: "aggregate", db: true, at: [141, 470, "start"] },
  d_ship: { d: `M560,386 L560,440 L${cx("shipments")},440 L${cx("shipments")},498`, label: "load_object", db: true, at: [cx("shipments") + 6, 488, "start"] },
  d_onto: { d: `M590,386 L590,452 L${cx("ontology")},452 L${cx("ontology")},498`, label: "definitions", db: true, at: [cx("ontology") + 6, 488, "start"] },
  d_cl: { d: `M620,386 L620,464 L${cx("clauses")},464 L${cx("clauses")},498`, label: "$lookup · $graphLookup", db: true, at: [cx("clauses") + 6, 488, "start"] },
  d_kn: { d: `M${cx("clauses")},558 C${cx("clauses")},590 ${cx("knowledge")},590 ${cx("knowledge")},560`, label: "chunkId", db: true, at: [(cx("clauses") + cx("knowledge")) / 2, 602, "middle"] },
  vec: { d: `M940,246 L940,476 L${cx("knowledge")},476 L${cx("knowledge")},498`, label: "$vectorSearch", db: true, at: [830, 470, "middle"] },
};

export type Flow = { wires: string[]; cards: string[]; collections: string[] };

const ENGINE_FLOW: Flow = {
  wires: ["q", "llm", "gw", "tools", "eng", "d_ship", "d_onto", "d_cl", "d_kn", "reg", "det", "d_read", "rules"],
  cards: ["ui", "agent", "llm", "gateway", "tools", "engine", "registry", "detection", "rules"],
  collections: ["shipments", "ontology", "clauses", "knowledge", "readings", "checkpoints"],
};

export const FLOWS: Record<string, Flow> = {
  obligations: ENGINE_FLOW,
  briefing: { ...ENGINE_FLOW, wires: [...ENGINE_FLOW.wires, "sensor"] },
  search: { wires: ["q", "llm", "gw", "tools", "vec"], cards: ["ui", "agent", "llm", "gateway", "tools"], collections: ["knowledge", "checkpoints"] },
};

const step = (wires: string[], cards: string[], collections: string[] = []): Flow => ({ wires, cards, collections });

/** What each numbered step of a flow lights, in the order of COPY[language].flowSteps. */
export const STEP_LIGHTS: Record<string, Flow[]> = {
  obligations: [
    step(["q", "llm"], ["ui", "agent", "llm"]),
    step(["gw", "tools", "eng"], ["gateway", "tools", "engine"]),
    step(["d_ship", "d_onto"], ["engine"], ["shipments", "ontology"]),
    step(["d_cl", "d_kn"], ["engine"], ["clauses", "knowledge"]),
    step(["reg", "det", "d_read"], ["engine", "registry", "detection"], ["readings"]),
    step(["rules", "d_cl"], ["engine", "rules"], ["clauses"]),
    step(["llm", "q"], ["llm", "agent", "ui"], ["checkpoints"]),
  ],
  briefing: [
    step(["q", "llm", "gw", "tools"], ["ui", "agent", "llm", "gateway", "tools"]),
    step(["sensor", "d_read"], ["tools", "detection"], ["readings"]),
    step(["eng", "d_ship", "d_onto", "d_cl", "d_kn", "reg", "det", "d_read", "rules"], ["engine", "registry", "detection", "rules"],
         ["shipments", "ontology", "clauses", "knowledge", "readings"]),
    step(["llm", "q"], ["llm", "agent", "ui"], ["checkpoints"]),
  ],
  search: [
    step(["q", "llm", "gw", "tools"], ["ui", "agent", "llm", "gateway", "tools"]),
    step([], ["tools"]),
    step(["vec"], ["tools"], ["knowledge"]),
    step(["llm", "q"], ["llm", "agent", "ui"], ["checkpoints"]),
    step(["q", "llm", "gw", "tools", "vec"], ["ui", "agent", "llm", "gateway", "tools"], ["knowledge"]),
  ],
};

/** The wire from the engine to each collection a trace step names. */
const ENGINE_WIRES: Record<string, string[]> = {
  shipments: ["d_ship"], ontology: ["d_onto"], clauses: ["d_cl"], knowledge: ["d_kn"], readings: ["det", "d_read"],
};

/** What the last question touched: the tools it called and the collections the engine read. */
export type LastRun = { tools: string[]; collections: string[] };

/**
 * Lights the path of the last question: the agent and tools always, the
 * engine when a result carried a trace, the detectors for sensor tools,
 * and $vectorSearch for document search.
 */
export function lastFlow(run: LastRun): Flow {
  const flow: Flow = { wires: ["q", "llm"], cards: ["ui", "agent", "llm"], collections: ["checkpoints"] };
  if (!run.tools.length) return flow;
  flow.wires.push("gw", "tools");
  flow.cards.push("gateway", "tools");
  if (run.collections.length) {
    flow.wires.push("eng", "reg", "rules");
    flow.cards.push("engine", "registry", "rules");
    for (const c of run.collections) flow.wires.push(...(ENGINE_WIRES[c] ?? []));
    flow.collections.push(...run.collections);
  }
  const sensor = run.tools.some((t) => ["find_excursions", "find_energy_anomalies", "get_fleet_overview", "get_reefer_timeline", "collect_fleet_briefing"].includes(t));
  if (sensor) {
    flow.wires.push("sensor", "d_read");
    flow.cards.push("detection");
    flow.collections.push("readings");
  }
  if (run.tools.includes("search_knowledge")) {
    flow.wires.push("vec");
    flow.collections.push("knowledge");
  }
  if (run.tools.some((t) => ["get_shipment", "get_clause"].includes(t))) {
    flow.collections.push(run.tools.includes("get_shipment") ? "shipments" : "knowledge");
  }
  if (flow.wires.includes("det")) flow.cards.push("detection");
  return flow;
}

type Detail = { name: string; role: string; code: string; items: string[] };
type Copy = {
  flowNames: Record<string, string>;
  flowTitles: Record<string, string>;
  flowSteps: Record<string, [string, string][]>;
  zones: [string, string, string, string];
  slabNote: string;
  details: Record<string, Detail>;
  does: string;
  code: string;
  pickHint: string;
  lastEmpty: string;
  lastTitle: string;
  lastTools: string;
  lastCollections: string;
  flow: string;
  component: string;
  flowIntros: Record<string, string>;
  overview: string;
  start: string;
  prev: string;
  next: string;
};

export const COPY: Record<Language, Copy> = {
  en: {
    flowNames: { obligations: "Required actions", briefing: "Fleet briefing", search: "Document search", last: "Last question", none: "Show all" },
    flowTitles: {
      obligations: 'Required actions: "Whom must SHP-102 notify, and by when?"',
      briefing: 'Fleet briefing: "Brief me on FLEET-01."',
      search: 'Document search: "How long may the door stay open while unloading tuna?"',
    },
    flowSteps: {
      obligations: [
        ["Reads the question and picks a tool",
         "The LLM reads the 10 tool descriptions and picks the one that decides required actions (evaluate_obligations), for SHP-102. The LLM only picks the tool; it does not decide anything."],
        ["The request passes one gate to the engine",
         "Every tool call goes through the Gateway. It runs the function with that name and returns errors as results instead of crashing the agent."],
        ["Reads the shipment and how it is defined",
         "The ontology says a shipment lives in shipments, is keyed by shipmentId, and runs from departure to delivery. The engine reads SHP-102 and its period that way."],
        ["Picks the contract clauses that apply",
         "From the contract version and the cargo class (live fish → live seafood → seafood) it selects 9 clauses, and $lookup attaches each clause's text in the same query."],
        ["Finds incidents in the sensor readings",
         "For each event a clause waits on (temperature excursion, compressor stop, …) the Registry finds the detector, which aggregates readings. Consecutive runs are grouped inside the database with $setWindowFields."],
        ["Compares with each condition and decides",
         "Each clause's condition is checked against the measured value: 24 min ≥ 15 min, so Art. 6 triggers. Clauses that build on a triggered one (Art. 7) are found with $graphLookup."],
        ["Answers, quoting the sources",
         "The LLM writes the answer from the engine's result and the clause text. Numbers and deadlines are the engine's. The conversation is saved in checkpoints for follow-up questions."],
      ],
      briefing: [
        ["Sees a briefing request and picks one tool",
         "The LLM picks collect_fleet_briefing. The code makes all the lookups a briefing needs in one go, so the LLM does not go back and forth between tools."],
        ["Gathers sensor summaries for the whole fleet",
         "Per reefer: average, lowest, and highest temperature, temperature excursions, and power trends, aggregated from readings."],
        ["Decides required actions for each shipment",
         "For each of the five shipments the engine runs the same six steps as Required actions. Each run takes tens of milliseconds."],
        ["Writes the briefing as it streams",
         "One more LLM call, ordered as action required, needs confirmation, incidents. Text appears on screen as it is written."],
      ],
      search: [
        ["Sees that the answer is in a document",
         "\"How long may the door stay open while unloading tuna?\" asks for a rule's wording, not a verdict. The LLM picks search_knowledge."],
        ["Turns the question into numbers",
         "MongoDB's Voyage AI embedding model (voyage-4) turns the question's meaning into a vector of 1,024 numbers."],
        ["Finds the passages closest in meaning",
         "$vectorSearch finds the nearest chunks in knowledge. A filter keeps only the shipment's contract version and the SOPs for its cargo, so another shipper's contract is never cited."],
        ["Answers, quoting what it found",
         "The LLM answers and names each passage's source: the document and the article."],
        ["Does not use the engine",
         "Nothing needs a verdict here, so the engine path stays dark."],
      ],
    },
    zones: ["AGENT", "TOOLS", "ENGINE", "MONGODB ATLAS · ONE DATABASE"],
    slabNote: "Sensors, facts, definitions, rules, documents, and conversations: one cluster, one query language",
    does: "What it does",
    code: "Code",
    pickHint: "Click a component on the stage for its details here.",
    lastEmpty: "Ask a question in the Operations tab; its path shows here.",
    lastTitle: "Last question",
    lastTools: "Tools called",
    lastCollections: "Collections the engine read",
    flow: "Flow",
    component: "Component",
    flowIntros: {
      obligations: "A question about one shipment: what must be done now, by whom, and by when. The engine decides, by comparing the contract clauses with the sensor readings; the LLM passes the result on with its sources. It is the longest path, through the engine and most of the collections.",
      briefing: "A request to sum up the whole fleet today. One tool brings back the sensor summary of all five reefers and the required actions for every shipment; the LLM turns that into a briefing that is easy to read.",
      search: "A question about the wording of a rule or a manual. Nobody knows which document holds it, so the search goes by meaning (vector search). Nothing needs a verdict, so the engine is not used.",
    },
    overview: "← Overview",
    start: "Step through →",
    prev: "← Back",
    next: "Next →",
    details: {
      ui: { name: "Operator UI", role: "Where questions are asked and answers, evidence, and traces are shown", code: "frontend/ · cli.py", items: ["Sends: the question, thread id, language", "Receives: text as it is written, tool events, the engine trace, stats"] },
      agent: { name: "Agent", role: "LangGraph StateGraph: the loop between the LLM and the tools", code: "src/coldchain_copilot/agent.py", items: ["llm node: prompt plus tool results of the last 3 questions", "tools node: runs the requested tools concurrently", "The current time and answer language come in the run context"] },
      llm: { name: "Chat model", role: "Chooses tools and writes the answer, nothing else", code: "LLM_MODEL in .env", items: ["Receives: prompt, conversation, 10 tool descriptions", "Sends: tool calls or the answer", "Changing the model is one line in .env"] },
      gateway: { name: "Gateway", role: "The only way the LLM reaches data", code: "src/coldchain_copilot/tools/gateway.py", items: ["Tool name → function", 'Errors come back as {"error": ...}, never raised', "Every time in UTC plus a KST display string"] },
      tools: { name: "Tools ×10", role: "Read-only tools in five levels", code: "src/coldchain_copilot/tools/", items: ["lookup · sensor · documents", "briefing: collect_fleet_briefing", "obligations: evaluate_obligations", "ad hoc: run_aggregation (checked before it runs)"] },
      engine: { name: "Engine", role: "Decides every applicable clause for one shipment, in six steps", code: "src/coldchain_copilot/engine.py", items: ["1 object and period · 2 clauses with their text", "3 detect events · 4 compare conditions", "5 follow references · 6 action handlers", "Nothing stored; computed from the source each time"] },
      registry: { name: "Registry", role: "Function names in the ontology → real functions", code: "src/coldchain_copilot/registry.py", items: ["DETECTORS · TRAVERSERS · ACTIONS", "To move a relation to a graph database, register another function under the same name"] },
      detection: { name: "Detection", role: "Aggregations that find events in the readings", code: "src/coldchain_copilot/detection.py", items: ["$setWindowFields with $shift for consecutive runs", "Last 24 hours against the 48 before, for trends", "Attaches the cause that overlaps in time"] },
      rules: { name: "Rules", role: "Compares conditions and computes deadlines", code: "src/coldchain_copilot/rules.py", items: ["triggered / not_triggered / unresolved", "basis: actual value against the required one", "Clauses that follow another (Art. 7)"] },
      readings: { name: "readings", role: "Time Series collection", code: "timeField: ts · metaField: meta", items: ["One per minute: 5 reefers × 72 hours = 21,600", "meta holds a snapshot of the shipment's temperature policy"] },
      shipments: { name: "shipments", role: "Five shipments", code: "documents", items: ["Reefer, cargo class, contract version, temperature policy, period"] },
      ontology: { name: "ontology", role: "34 definitions", code: "data/ontology.json → seed", items: ["Object types · classes · links · events · actions · parties", "No logic, names only"] },
      clauses: { name: "clauses", role: "15 rules", code: "data/clauses.json → seed", items: ["Condition, action, party, deadline, chunkId", "Linked to each other by references"] },
      knowledge: { name: "knowledge", role: "23 document chunks with vectors", code: "Vector Search index: knowledge_vector", items: ["One clause = one chunk", "$lookup when the chunk is known, $vectorSearch when it is not"] },
      checkpoints: { name: "checkpoints", role: "The agent's conversation state", code: "LangGraph MongoDBSaver", items: ["Messages and tool results per thread"] },
    },
  },
  ko: {
    flowNames: { obligations: "조치 판정", briefing: "플릿 브리핑", search: "문서 검색", last: "방금 한 질문", none: "전체 보기" },
    flowTitles: {
      obligations: '조치 판정: "SHP-102는 누구에게 언제까지 통보해야 해?"',
      briefing: '플릿 브리핑: "FLEET-01 현황"',
      search: '문서 검색: "참치 하역 때 문은 얼마나?"',
    },
    flowSteps: {
      obligations: [
        ["질문을 읽고 필요한 도구를 고릅니다",
         "LLM이 도구 설명 10개를 읽고 '조치를 판정하는 도구'(evaluate_obligations)를 골라 SHP-102로 부릅니다. LLM은 판정하지 않고 도구만 고릅니다."],
        ["요청이 하나의 문을 지나 엔진으로 갑니다",
         "모든 도구 호출은 Gateway를 지납니다. Gateway가 이름에 맞는 함수를 실행하고, 오류가 나도 에이전트를 멈추지 않고 결과로 돌려줍니다."],
        ["배송과 그 정의를 읽습니다",
         "온톨로지에 '배송은 shipments 컬렉션, 키는 shipmentId, 기간은 출발부터 도착까지'라고 정의되어 있습니다. 엔진은 이 정의대로 SHP-102와 운송 기간을 읽습니다."],
        ["이 배송에 적용되는 계약 조항을 고릅니다",
         "계약 버전과 화물 분류(활어 → 활수산물 → 수산물)로 조항 9개를 고르고, $lookup으로 각 조항의 원문을 같은 쿼리에서 붙입니다."],
        ["센서 기록에서 사건을 찾습니다",
         "조항이 기다리는 사건(온도 이탈, 압축기 정지 등)마다 Registry가 탐지 함수를 찾아 readings를 집계합니다. 연속된 구간은 $setWindowFields로 DB 안에서 묶습니다."],
        ["조건과 비교해 발동 여부를 정합니다",
         "조항의 조건을 실제 값과 비교합니다. 24분 ≥ 15분이라 6조가 발동합니다. 발동한 조항을 참조하는 조항(7조)은 $graphLookup으로 따라가 찾습니다."],
        ["근거를 인용해 답합니다",
         "LLM이 엔진 결과와 조항 원문으로 답을 씁니다. 숫자와 기한은 엔진이 정한 그대로입니다. 대화는 checkpoints에 저장되어 후속 질문에 쓰입니다."],
      ],
      briefing: [
        ["브리핑 요청임을 알아보고 도구 하나를 고릅니다",
         "LLM이 collect_fleet_briefing을 고릅니다. 브리핑에 필요한 조회를 코드가 한 번에 하기 때문에, LLM이 도구를 여러 번 오가지 않습니다."],
        ["플릿 전체의 센서 요약을 모읍니다",
         "리퍼마다 평균·최저·최고 온도, 온도 이탈, 전력 추세를 readings에서 집계합니다."],
        ["배송마다 필요한 조치를 판정합니다",
         "배송 5개 각각에 대해 엔진이 '조치 판정'과 같은 6단계를 돕니다. 한 번에 수십 밀리초 걸립니다."],
        ["브리핑을 쓰며 화면에 바로 보여 줍니다",
         "LLM 호출은 한 번 더입니다. 조치 필요, 확인 필요, 사건 순서로 정리하고, 글자가 써지는 대로 화면에 나옵니다."],
      ],
      search: [
        ["문서에서 답을 찾아야 하는 질문임을 알아봅니다",
         "'참치 하역 때 문을 얼마나 열어 둬도 되나'는 판정이 아니라 규정 문구를 묻는 질문입니다. LLM이 search_knowledge를 고릅니다."],
        ["질문을 숫자로 바꿉니다",
         "MongoDB의 Voyage AI 임베딩 모델(voyage-4)이 질문의 뜻을 숫자 1,024개짜리 벡터로 바꿉니다."],
        ["뜻이 가장 가까운 문서 조각을 찾습니다",
         "$vectorSearch가 knowledge에서 가까운 조각을 찾습니다. 그 배송의 계약 버전과 화물 SOP만 남기도록 필터해서, 다른 화주의 계약은 근거로 나오지 않습니다."],
        ["찾은 원문을 인용해 답합니다",
         "LLM이 조각의 출처(문서와 조항)를 밝히며 답합니다."],
        ["엔진은 쓰지 않습니다",
         "무엇이 발동했는지 판정할 질문이 아니라서, 엔진 쪽 경로는 꺼진 채로 남습니다."],
      ],
    },
    zones: ["AGENT", "TOOLS", "ENGINE", "MONGODB ATLAS · 하나의 데이터베이스"],
    slabNote: "센서 · 사실 · 정의 · 규칙 · 원문 · 대화가 같은 클러스터, 같은 쿼리 언어",
    does: "하는 일",
    code: "코드",
    pickHint: "무대의 구성 요소를 누르면 여기에 설명이 나옵니다.",
    lastEmpty: "운영 탭에서 질문하면 그 질문이 지나간 길이 여기 켜집니다.",
    lastTitle: "방금 한 질문",
    lastTools: "부른 도구",
    lastCollections: "엔진이 읽은 컬렉션",
    flow: "흐름",
    component: "구성 요소",
    flowIntros: {
      obligations: "배송 하나에 대해 '지금 무엇을, 누가, 언제까지 해야 하는지'를 묻는 질문입니다. 판정은 LLM이 아니라 엔진이 계약 조항과 센서 기록을 비교해서 내리고, LLM은 그 결과를 근거와 함께 전달합니다. 엔진과 대부분의 컬렉션을 거치는 가장 긴 흐름입니다.",
      briefing: "플릿 전체의 오늘 상황을 한 번에 정리해 달라는 요청입니다. 도구 하나가 리퍼 5대의 센서 요약과 배송별 조치 판정을 모두 모아 오고, LLM은 그것을 읽기 쉬운 브리핑으로 씁니다.",
      search: "규정이나 매뉴얼의 문구를 묻는 질문입니다. 어느 문서에 있는지 모르기 때문에 뜻으로 찾는 벡터 검색을 쓰고, 판정할 것이 없어서 엔진은 거치지 않습니다.",
    },
    overview: "← 흐름 소개",
    start: "단계별로 보기 →",
    prev: "← 이전",
    next: "다음 →",
    details: {
      ui: { name: "운영자 화면", role: "질문하고, 답과 근거, 실행 기록을 보는 곳", code: "frontend/ · cli.py", items: ["보냄: 질문, thread id, 언어", "받음: 글자 스트림, 도구 이벤트, 엔진 기록, 통계"] },
      agent: { name: "Agent", role: "LangGraph StateGraph: LLM과 도구 사이의 고리", code: "src/coldchain_copilot/agent.py", items: ["llm 노드: 프롬프트 + 최근 질문 3개의 도구 결과", "tools 노드: 요청된 도구를 동시에 실행", "현재 시각과 답변 언어는 run context로 주입"] },
      llm: { name: "Chat model", role: "도구 선택과 답변 작성만", code: ".env의 LLM_MODEL", items: ["받음: 프롬프트, 대화, 도구 설명 10개", "보냄: 도구 호출 또는 답변", "모델 교체는 .env 한 줄"] },
      gateway: { name: "Gateway", role: "LLM이 데이터에 닿는 유일한 문", code: "src/coldchain_copilot/tools/gateway.py", items: ["도구 이름 → 함수", '오류는 예외 대신 {"error": ...}', "모든 시각에 UTC + KST 문자열"] },
      tools: { name: "Tools ×10", role: "읽기 전용 도구 다섯 단계", code: "src/coldchain_copilot/tools/", items: ["lookup · sensor · documents", "briefing: collect_fleet_briefing", "obligations: evaluate_obligations", "ad hoc: run_aggregation (검사 후 실행)"] },
      engine: { name: "Engine", role: "배송 1건의 모든 적용 조항을 6단계로 판정", code: "src/coldchain_copilot/engine.py", items: ["1 객체와 기간 · 2 조항 + 원문", "3 탐지 · 4 비교", "5 참조 따라가기 · 6 행동 처리기", "저장하지 않고 매번 원본에서 계산"] },
      registry: { name: "Registry", role: "온톨로지의 함수 이름 → 실제 함수", code: "src/coldchain_copilot/registry.py", items: ["DETECTORS · TRAVERSERS · ACTIONS", "그래프 DB로 바꾸려면 같은 이름에 다른 함수 등록"] },
      detection: { name: "Detection", role: "측정값에서 이벤트를 찾는 집계", code: "src/coldchain_copilot/detection.py", items: ["$setWindowFields + $shift로 연속 구간", "최근 24시간 vs 이전 48시간 추세", "시간이 겹치는 원인 붙이기"] },
      rules: { name: "Rules", role: "조건 비교와 기한 계산", code: "src/coldchain_copilot/rules.py", items: ["triggered / not_triggered / unresolved", "basis: 실제값 vs 기준값", "연결 조항(7조) 처리"] },
      readings: { name: "readings", role: "Time Series 컬렉션", code: "timeField: ts · metaField: meta", items: ["1분 1건, 5대 × 72시간 = 21,600건", "meta에 배송의 온도 기준 스냅샷"] },
      shipments: { name: "shipments", role: "배송 5건", code: "documents", items: ["리퍼, 화물 분류, 계약 버전, 온도 기준, 기간"] },
      ontology: { name: "ontology", role: "정의 34개", code: "data/ontology.json → seed", items: ["객체 · 분류 · 관계 · 이벤트 · 행동 · 담당자", "로직 없음, 이름만"] },
      clauses: { name: "clauses", role: "규칙 15개", code: "data/clauses.json → seed", items: ["조건, 행동, 담당자, 기한, chunkId", "references로 서로 연결"] },
      knowledge: { name: "knowledge", role: "문서 조각 23개 + 벡터", code: "Vector Search index: knowledge_vector", items: ["조항 1개 = 조각 1개", "알 때는 $lookup, 모를 때는 $vectorSearch"] },
      checkpoints: { name: "checkpoints", role: "에이전트 대화 상태", code: "LangGraph MongoDBSaver", items: ["thread별 메시지와 도구 결과"] },
    },
  },
};
