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
  rules: { d: "M730,353 L768,353", label: "compare" },
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
  flowSteps: Record<string, string[]>;
  zones: [string, string, string, string];
  slabNote: string;
  details: Record<string, Detail>;
  order: string;
  does: string;
  code: string;
  pickHint: string;
  litFlow: string;
  lastEmpty: string;
  lastTitle: string;
  lastTools: string;
  lastCollections: string;
};

export const COPY: Record<Language, Copy> = {
  en: {
    flowNames: { obligations: "Obligations", briefing: "Fleet briefing", search: "Document search", last: "Last question", none: "Show all" },
    flowTitles: {
      obligations: 'Obligations: "Whom must SHP-102 notify, and by when?"',
      briefing: 'Fleet briefing: "Brief me on FLEET-01."',
      search: 'Document search: "How long may the door stay open while unloading tuna?"',
    },
    flowSteps: {
      obligations: [
        "The LLM picks evaluate_obligations",
        "Gateway → tool → engine",
        "Reads the shipment and its definitions (shipments, ontology)",
        "Applicable clauses with their text ($lookup knowledge)",
        "Finds each detector through the registry and aggregates readings",
        "Compares conditions; follows Art. 7 with $graphLookup",
        "The LLM answers quoting the text; the conversation goes to checkpoints",
      ],
      briefing: [
        "The LLM picks one tool: collect_fleet_briefing",
        "The tool collects the fleet overview, excursions, and power trends",
        "The engine runs its six steps for each of the five shipments",
        "One more LLM call, which writes the briefing as it streams",
      ],
      search: [
        "The LLM picks search_knowledge",
        "The question is embedded",
        "$vectorSearch, filtered to the shipment's contract version and cargo SOPs",
        "The answer quotes the chunks found",
        "No engine: this asks for text, not a verdict",
      ],
    },
    zones: ["AGENT", "TOOLS", "ENGINE", "MONGODB ATLAS · ONE DATABASE"],
    slabNote: "Sensors, facts, definitions, rules, documents, and conversations: one cluster, one query language",
    order: "Order",
    does: "What it does",
    code: "Code",
    pickHint: "Click a component for its details.",
    litFlow: "Lit flow",
    lastEmpty: "Ask a question in the Operations tab; its path shows here.",
    lastTitle: "Last question",
    lastTools: "Tools called",
    lastCollections: "Collections the engine read",
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
    flowNames: { obligations: "의무 질문", briefing: "플릿 브리핑", search: "문서 검색", last: "방금 한 질문", none: "전체 보기" },
    flowTitles: {
      obligations: '의무 질문: "SHP-102는 누구에게 언제까지 통보?"',
      briefing: '플릿 브리핑: "FLEET-01 현황"',
      search: '문서 검색: "참치 하역 때 문은 얼마나?"',
    },
    flowSteps: {
      obligations: [
        "LLM이 evaluate_obligations를 고름",
        "gateway → 도구 → 엔진",
        "배송과 정의를 읽음 (shipments, ontology)",
        "적용 조항과 원문 ($lookup knowledge)",
        "레지스트리로 탐지기를 찾아 readings 집계",
        "규칙으로 조건 비교, $graphLookup으로 7조",
        "LLM이 원문을 인용해 답변, 대화는 checkpoints에",
      ],
      briefing: [
        "LLM이 collect_fleet_briefing 하나를 고름",
        "도구가 플릿 요약, 이탈, 전력 추세를 수집",
        "배송 5건마다 엔진 6단계 (같은 길을 5번)",
        "LLM 호출은 1번 더, 브리핑을 쓰며 화면에 스트리밍",
      ],
      search: [
        "LLM이 search_knowledge를 고름",
        "질문을 임베딩",
        "$vectorSearch: 그 배송의 계약 버전과 화물 SOP만 필터",
        "찾은 조각을 인용해 답변",
        "엔진은 쓰지 않음: 판정이 아니라 원문 질문",
      ],
    },
    zones: ["AGENT", "TOOLS", "ENGINE", "MONGODB ATLAS · 하나의 데이터베이스"],
    slabNote: "센서 · 사실 · 정의 · 규칙 · 원문 · 대화가 같은 클러스터, 같은 쿼리 언어",
    order: "순서",
    does: "하는 일",
    code: "코드",
    pickHint: "구성 요소를 누르면 각각의 설명이 나옵니다.",
    litFlow: "켜진 흐름",
    lastEmpty: "운영 탭에서 질문하면 그 질문이 지나간 길이 여기 켜집니다.",
    lastTitle: "방금 한 질문",
    lastTools: "부른 도구",
    lastCollections: "엔진이 읽은 컬렉션",
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
