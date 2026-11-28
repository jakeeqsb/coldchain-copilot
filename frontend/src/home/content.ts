// What the Home tab says: what the copilot does, how it works, what to ask,
// and where each tab goes. Questions match the chat's suggestions.

import type { Language } from "../i18n";

export type TabId = "operations" | "ontology" | "architecture" | "why";

type Copy = {
  eyebrow: string;
  title: string;
  lead: string;
  open: string;
  openOntology: string;
  live: string;
  liveNote: string;
  reefers: string;
  action: string;
  confirm: string;
  excursions: string;
  how: string;
  steps: [string, string, string][];
  ask: string;
  askNote: string;
  levels: [string, string, string][];
  tour: string;
  tabs: Record<TabId, [string, string, string]>;
  stop: string;
  go: string;
  principles: string;
  rules: [string, string][];
  stack: string;
};

export const COPY: Record<Language, Copy> = {
  ko: {
    eyebrow: "MongoDB 운영 온톨로지 + AI",
    title: "냉장 운송 사고를 감지하고, 계약상 해야 할 일을 근거와 함께 알려 주는 운영 코파일럿",
    lead: "리퍼(냉장 컨테이너)는 1분마다 온도, 압축기 전력, 문 상태를 보냅니다. 기준을 넘었는지 보는 건 쉽습니다. 어려운 건 그다음입니다. 왜 일어났는지, 이 화주의 계약은 무엇을 언제까지 요구하는지, SOP와 정비 매뉴얼은 무엇을 권하는지. 코파일럿은 센서 데이터의 사실과 문서의 규칙을 MongoDB 하나에서 이어서 답합니다.",
    open: "운영 화면 열기",
    openOntology: "온톨로지 보기",
    live: "지금 FLEET-01",
    liveNote: "최근 24시간 · 엔진 판정",
    reefers: "리퍼",
    action: "조치 필요",
    confirm: "확인 필요",
    excursions: "온도 이탈",
    how: "어떻게 동작하나",
    steps: [
      ["감지", "Time Series 집계", "측정값에서 '4 °C 초과 24분 연속' 같은 사실을 DB가 계산합니다."],
      ["판정", "온톨로지 + 엔진", "그 배송에 적용되는 계약 조항을 고르고, 조건과 비교해 발동 여부와 기한을 정합니다."],
      ["설명", "LLM + 근거", "LLM은 판정 결과를 계약 원문과 함께 전달합니다. 숫자와 기한은 엔진이 정한 그대로입니다."],
    ],
    ask: "이렇게 물어보세요",
    askNote: "누르면 운영 탭에서 바로 질문합니다",
    levels: [
      ["1 · 조회", "SHP-102는 어디로 가고 있어?", "배송 문서"],
      ["2 · 센서 분석", "오늘 RF-02 온도 보여줘. 왜 기준을 벗어났어?", "Time Series 집계"],
      ["3 · 문서 검색", "참치 하역할 때 문을 얼마나 열어둬도 돼?", "Vector Search"],
      ["4 · 브리핑", "FLEET-01 오늘 현황 브리핑해줘", "2 + 3 + 5를 한 번에"],
      ["5 · 조치 판정", "RF-02는 뭘 해야 해? 화주가 인수를 거부할 수 있어?", "온톨로지: 조항을 규칙으로"],
    ],
    tour: "둘러보기 노선",
    stop: "정류장",
    tabs: {
      operations: ["운영", "플릿 상태, 배송별 측정값, 그리고 같은 데이터로 답하는 질의응답. 답변 아래에 차트와 엔진 실행 기록이 붙습니다.", "실시간 데이터 · 질의응답"],
      ontology: ["온톨로지", "엔진이 읽는 타입과 관계를 DB에서 그대로 그립니다. 배송 하나를 고르면 적용 조항과 판정이 색으로 보입니다.", "타입 · 관계 · 판정"],
      architecture: ["아키텍처", "질문 종류마다 어떤 구성 요소가 어떤 컬렉션을 읽는지, 단계별로 따라갑니다.", "질문 하나의 경로"],
      why: ["Why MongoDB", "DB 다섯 개 대신 하나로 무엇이 달라지는지, RAG만으로 왜 부족한지, 데이터를 어떻게 모델링했는지.", "모델링 · 비교"],
    },
    go: "열기 →",
    principles: "설계 원칙",
    rules: [
      ["DB가 계산하고, LLM은 설명합니다", "센서 사실은 집계에서 나옵니다. LLM은 측정값을 세지 않습니다."],
      ["규칙은 데이터입니다", "조항의 발동 여부는 이름 붙은 측정값과 조건을 비교해 정합니다."],
      ["근거는 맞는 계약에서", "배송에 배정된 계약 버전의 조항만 씁니다."],
      ["근거가 없으면 결론도 없습니다", "판단할 데이터가 없으면 '의무 없음'이 아니라 '확인 필요'입니다."],
    ],
    stack: "MongoDB Atlas (Time Series · Vector Search · $lookup · $graphLookup) · Voyage AI · LangGraph · 도구 호출 LLM",
  },
  en: {
    eyebrow: "MongoDB operational ontology + AI",
    title: "An operations copilot that detects cold-chain incidents and says what the contract requires, with the evidence",
    lead: "Every reefer reports temperature, compressor power, and door status every minute. Spotting a breach is easy. The work comes after: why it happened, what this shipper's contract requires and by when, and what the SOPs and maintenance manuals recommend. The copilot connects the facts in the sensor data with the rules in the documents, in one MongoDB.",
    open: "Open Operations",
    openOntology: "See the ontology",
    live: "FLEET-01 now",
    liveNote: "last 24 h · engine verdict",
    reefers: "Reefers",
    action: "Action required",
    confirm: "Needs confirmation",
    excursions: "Excursions",
    how: "How it works",
    steps: [
      ["Detect", "Time Series aggregation", "The database computes facts such as \"above 4 °C for 24 consecutive minutes\" from the readings."],
      ["Decide", "Ontology + engine", "It selects the clauses that apply to the shipment, compares their conditions, and sets what triggers and by when."],
      ["Explain", "LLM + sources", "The LLM passes the verdict on with the contract text. Numbers and deadlines are the engine's."],
    ],
    ask: "Try asking",
    askNote: "Click to ask in the Operations tab",
    levels: [
      ["1 · Lookup", "Where is SHP-102 heading?", "Shipment document"],
      ["2 · Sensor analysis", "Show me RF-02's temperature today. Why did it leave the range?", "Time Series aggregation"],
      ["3 · Document search", "How long can the door stay open while unloading tuna?", "Vector Search"],
      ["4 · Briefing", "Brief me on FLEET-01 today.", "2 + 3 + 5 at once"],
      ["5 · Required actions", "What must be done for RF-02? Can the shipper refuse delivery?", "Ontology: clauses as rules"],
    ],
    tour: "The route",
    stop: "Stop",
    tabs: {
      operations: ["Operations", "Fleet status, per-shipment measurements, and questions answered from the same data, with charts and the engine trace under each answer.", "live data · questions"],
      ontology: ["Ontology", "The types and relations the engine reads, drawn from the database. Pick a shipment to see the clauses that apply and their verdicts.", "types · relations · verdicts"],
      architecture: ["Architecture", "Step through which component reads which collection, for each kind of question.", "the path of one question"],
      why: ["Why MongoDB", "What one database changes over five, why RAG alone falls short, and how each kind of data is modeled.", "modeling · comparison"],
    },
    go: "Open →",
    principles: "Design principles",
    rules: [
      ["The database calculates; the LLM explains", "Sensor facts come from aggregation. The LLM never counts raw readings."],
      ["Rules are data", "Whether a clause applies is decided by comparing named measures with structured conditions."],
      ["Evidence from the right contract", "Only clauses from the contract version assigned to the shipment are used."],
      ["No evidence, no conclusion", "When data is missing, the answer is \"needs confirmation\", never \"no obligation\"."],
    ],
    stack: "MongoDB Atlas (Time Series · Vector Search · $lookup · $graphLookup) · Voyage AI · LangGraph · a tool-calling LLM",
  },
};
