// UI text in English and Korean. The agent answers in the UI language too
// (POST /api/ask sends `language`).

export type Language = "en" | "ko";

const TEXT = {
  en: {
    brandSub: "MongoDB operational ontology + AI",
    language: "Language",
    tabs: {
      operations: "Operations",
      ontology: "Ontology",
      architecture: "Architecture",
      why: "Why MongoDB",
    },
    heads: {
      operations: ["Operations", "Live reefer measurements per shipment, and questions answered from the same data."],
      ontology: ["Ontology", "The types, links, and rules the engine reads, and the entities they connect."],
      architecture: ["Architecture", "Which component reads which collection, step by step, for each kind of question."],
      why: ["Why MongoDB", "The MongoDB features this demo runs on, with the pipelines it actually uses."],
    },
    comingSoon: "This tab is built in a later step.",
    fleet: "Fleet",
    window: "Last 24 h",
    loading: "Loading…",
    loadFailed: "Could not load data. Is the API running (uv run coldchain-copilot-web)?",
    last: "Last",
    range: "Range",
    excursions: "Excursions",
    status: { triggered: "Action required", unresolved: "Needs confirmation", ok: "Normal" },
    cargo: {
      "cargo:live_fish": "Live fish",
      "cargo:oyster": "Oysters",
      "cargo:frozen_tuna": "Frozen tuna",
      "cargo:frozen_shrimp": "Frozen shrimp",
    } as Record<string, string>,
    compare: "Fleet temperature",
    dash: {
      title: "Measurements",
      temp: "Temperature",
      power: "Power",
      door: "Door",
      band: "Allowed",
      outside: "Outside range",
      peak: "Peak",
      last: "Last",
      minMax: "Min / max",
      avgPower: "Avg power",
      doorMinutes: "Door open",
      min: "min",
      excursion: "Excursion",
      cause: "Cause",
    },
    causes: { "cause:compressor_stop": "compressor stop", "cause:door_opening": "door opening" } as Record<string, string>,
    w: {
      fleet: "Fleet status",
      shipments: "shipments",
      obligations: "Obligations",
      clauses: "clauses",
      deadlines: "Deadlines from the event start",
      now: "now",
      eventStart: "event start",
      due: "due",
      follows: "follows",
      noEvent: "no event",
      missing: "data missing",
      documents: "Documents",
      trace: "Engine trace",
      inCode: "in code",
      status: { triggered: "Triggered", unresolved: "Needs confirmation", not_triggered: "Not triggered" } as Record<string, string>,
      actions: { notify: "Notify", inspect: "Inspect", hold: "Hold", report: "Report", maintain: "Maintain", retrain: "Retrain" } as Record<string, string>,
      steps: {
        object: "Read the shipment",
        clauses: "Select clauses",
        events: "Detect events",
        conditions: "Compare conditions",
        references: "Follow references",
        actions: "Build actions",
      } as Record<string, string>,
    },
    chat: {
      title: "Ask the copilot",
      reset: "New conversation",
      empty: "Ask about a shipment, a reefer, or the fleet. Answers come from the same data as the charts.",
      placeholder: "Ask a question",
      send: "Ask",
      thinking: "Thinking…",
      reading: "Reading the data…",
      firstText: "first text",
      cutOff: "The answer stopped before it finished. Check the API terminal for errors.",
      suggestions: [
        "Where is SHP-102 heading?",
        "Show me RF-02's temperature today. Why did it leave the range?",
        "How long can the door stay open while unloading tuna?",
        "Brief me on FLEET-01 today.",
        "What must be done for RF-02? Can the shipper refuse delivery?",
        "Does SHP-105 have any contract issues?",
      ],
    },
  },
  ko: {
    brandSub: "MongoDB 운영 온톨로지 + AI",
    language: "언어",
    tabs: {
      operations: "운영",
      ontology: "온톨로지",
      architecture: "아키텍처",
      why: "Why MongoDB",
    },
    heads: {
      operations: ["운영", "배송별 리퍼 측정값과, 같은 데이터로 답하는 질의응답."],
      ontology: ["온톨로지", "엔진이 읽는 타입, 관계, 규칙과 그것들이 잇는 엔터티."],
      architecture: ["아키텍처", "질문 종류마다 어떤 구성 요소가 어떤 컬렉션을 읽는지, 단계별로."],
      why: ["Why MongoDB", "이 데모가 쓰는 MongoDB 기능과 실제 파이프라인."],
    },
    comingSoon: "이 탭은 다음 단계에서 만듭니다.",
    fleet: "플릿",
    window: "최근 24시간",
    loading: "불러오는 중…",
    loadFailed: "데이터를 불러오지 못했습니다. API가 실행 중인지 확인하세요 (uv run coldchain-copilot-web).",
    last: "현재",
    range: "기준",
    excursions: "이탈",
    status: { triggered: "조치 필요", unresolved: "확인 필요", ok: "정상" },
    cargo: {
      "cargo:live_fish": "활어",
      "cargo:oyster": "굴",
      "cargo:frozen_tuna": "냉동 참치",
      "cargo:frozen_shrimp": "냉동 새우",
    } as Record<string, string>,
    compare: "플릿 온도 비교",
    dash: {
      title: "측정값",
      temp: "온도",
      power: "전력",
      door: "문",
      band: "기준",
      outside: "기준 이탈",
      peak: "최고",
      last: "현재",
      minMax: "최저 / 최고",
      avgPower: "평균 전력",
      doorMinutes: "문 열림",
      min: "분",
      excursion: "온도 이탈",
      cause: "원인",
    },
    causes: { "cause:compressor_stop": "압축기 정지", "cause:door_opening": "문 열림" } as Record<string, string>,
    w: {
      fleet: "플릿 상태",
      shipments: "개 배송",
      obligations: "의무 판정",
      clauses: "개 조항",
      deadlines: "사건 시작부터 기한까지",
      now: "지금",
      eventStart: "사건 시작",
      due: "기한",
      follows: "선행 조항",
      noEvent: "사건 없음",
      missing: "데이터 없음",
      documents: "근거 문서",
      trace: "엔진 실행 기록",
      inCode: "코드에서 계산",
      status: { triggered: "발동", unresolved: "확인 필요", not_triggered: "미발동" } as Record<string, string>,
      actions: { notify: "통보", inspect: "검사", hold: "보류", report: "보고", maintain: "정비", retrain: "재교육" } as Record<string, string>,
      steps: {
        object: "배송 읽기",
        clauses: "적용 조항 선택",
        events: "사건 탐지",
        conditions: "조건 비교",
        references: "참조 조항 따라가기",
        actions: "조치 만들기",
      } as Record<string, string>,
    },
    chat: {
      title: "코파일럿에게 질문",
      reset: "새 대화",
      empty: "배송, 리퍼, 플릿에 대해 물어보세요. 답은 차트와 같은 데이터에서 나옵니다.",
      placeholder: "질문을 입력하세요",
      send: "질문",
      thinking: "생각하는 중…",
      reading: "데이터를 읽는 중…",
      firstText: "첫 글자",
      cutOff: "답변이 끝나기 전에 끊겼습니다. API 터미널에 오류가 있는지 확인하세요.",
      suggestions: [
        "SHP-102는 어디로 가고 있어?",
        "오늘 RF-02 온도 보여줘. 왜 기준을 벗어났어?",
        "참치 하역할 때 문을 얼마나 열어둬도 돼?",
        "FLEET-01 오늘 현황 브리핑해줘",
        "RF-02는 뭘 해야 해? 화주가 인수를 거부할 수 있어?",
        "SHP-105에 계약상 문제 있어?",
      ],
    },
  },
};

export type Text = (typeof TEXT)["en"];

export function text(language: Language): Text {
  return TEXT[language];
}

const STORAGE_KEY = "coldchain.language";

export function savedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ko") return saved;
  } catch {
    // Storage can be blocked; fall back to Korean.
  }
  return "ko";
}

export function saveLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not saved; the choice still applies until reload.
  }
}
