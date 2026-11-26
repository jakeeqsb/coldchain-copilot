// What the Why MongoDB tab says, in four parts: the two architectures, the
// limits of plain RAG, one modeling story per kind of data, and what MongoDB
// does and does not do here. Text may use **bold** and `code`.

import type { Language } from "../i18n";

/**
 * Document examples, shaped like the seeded data. «…» marks the fields the
 * story is about. Shared by both languages.
 */
export const DOCS: Record<string, string | string[]> = {
  ts: `{
  ts: ISODate("2026-11-25T05:44:00Z"),
  «meta: {
    shipmentId: "SHP-102", reeferId: "RF-02",
    fleetId: "FLEET-01",
    temperaturePolicy: { minC: 0, maxC: 4 }
  }»,
  temp: 4.2, powerKw: 0.01, doorOpen: false
}`,
  doc: [
    `// two conditions
{ trigger: {
  eventType: "…excursion",
  «allOf: [
   {measure:"direction",…},
   {measure:"consecutive…",
    op:"gte",value:15}]» },
  deadline: {
   offsetMinutes: 60 } }`,
    `// follows another clause
{ trigger: {
  «clauseTriggered:
   "…-art6"» },
  action: {
   type: "inspect",
   before: "unloading" },
  «references: ["…-art6"]» }`,
    `// recommendation, no contract
{ «contractId: null»,
  kind: "recommendation",
  appliesTo:
   ["cargo:seafood"],
  trigger: {
   eventType: "…door" }
  // no deadline }`,
  ],
  onto: `{ _id: "Shipment", kind: "objectType",
  «collection: "shipments", key: "shipmentId",
  period: { start: "departedAt", end: "deliveredAt" }» }

{ _id: "event:temperature_excursion", kind: "eventType",
  «detector: "detect_temperature_excursion"»,
  causes: ["event:compressor_stop", "event:door_opening"] }`,
  vec: `{ chunkId: "sop-excursion-response-v1-section-3",
  source: "Temperature Excursion Response SOP § 3",
  text: "A door left open for more than 10 …",
  embedding: [ 0.013, -0.087, … ], // voyage-4, 1,024
  «docType: "sop", contractId: null,
  appliesTo: ["cargo:seafood"]» }`,
  ckpt: `MongoDBSaver(db.get_client(), db_name=settings.db_name)`,
};

type Point = { title: string; body: string; here: string };
type Story = { name: string; tag: string; problem: string; model: string; mongo: string[]; result: string; caption: string; caption2?: string };

export type Copy = {
  lead: string;
  beats: { problem: string; model: string; mongo: string; result: string };
  p1: { title: string; note: string; common: string; commonSub: string; ours: string; oursSub: string; points: Point[] };
  p2: { title: string; note: string; points: Point[] };
  p3: { title: string; note: string; stories: Record<string, Story> };
  p4: { title: string; note: string; does: string; doesNot: string; who: string; doesRows: [string, string, string?][]; notRows: [string, string, string][] };
  d: Record<string, string>;
};

export const STORY_ORDER = ["ts", "doc", "onto", "lookup", "graph", "vec", "ckpt"] as const;

export const COPY: Record<Language, Copy> = {
  ko: {
    lead: "콜드체인 코파일럿은 센서 시계열, 계약 규칙, 규칙 사이의 참조, 문서 원문 검색, 에이전트 대화를 함께 다룹니다. 보통은 이것들을 각각 다른 데이터베이스에 둡니다. 이 페이지는 그렇게 했을 때 무엇이 어려워지는지, RAG만으로는 왜 부족한지, 이 프로젝트가 각 데이터를 어떻게 모델링했는지, 그리고 MongoDB가 맡지 않는 일은 무엇인지 설명합니다.",
    beats: { problem: "문제", model: "모델링", mongo: "MongoDB", result: "그래서" },
    p1: {
      title: "흔한 구성과 이 프로젝트의 구성",
      note: "같은 기능을 만들 때 데이터가 어디에 놓이는가",
      common: "흔한 구성 · 데이터 종류마다 다른 DB",
      commonSub: "기능마다 \"그 일에 특화된\" 저장소를 붙입니다.",
      ours: "이 프로젝트 · MongoDB Atlas 하나",
      oursSub: "데이터 종류는 그대로 다르지만, 한 클러스터의 컬렉션으로 둡니다.",
      points: [
        { title: "운영 복잡도", body: "DB 다섯 개는 배포, 백업, 모니터링, 버전 업그레이드, 장애 대응이 각각 따로입니다. 담당자가 알아야 할 시스템도 다섯 개입니다.", here: "이 프로젝트: **클러스터 하나**를 운영합니다." },
        { title: "데이터 동기화", body: "계약 조항이 바뀌면 관계형 DB, 벡터 DB, 그래프 DB를 모두 다시 맞춰야 합니다. 동기화가 늦으면 판정은 새 조항으로, 근거 검색은 옛 조항으로 하는 일이 생깁니다.", here: "이 프로젝트: 조항과 원문이 **같은 DB**에 있어 맞출 것이 없습니다." },
        { title: "근거의 일관성", body: "판정과 근거가 서로 다른 시스템, 다른 시점의 데이터에서 나오면 \"왜 이런 판정이 났나\"를 감사할 때 설명하기 어렵습니다.", here: "이 프로젝트: 판정과 원문이 **한 쿼리**에서 함께 나옵니다." },
        { title: "비용", body: "시스템마다 인프라와 라이선스가 들고, 같은 조항이 세 곳에 중복 저장됩니다. 사람의 학습 비용도 시스템 수만큼 늘어납니다.", here: "이 프로젝트: 조항은 **한 곳**에만 있습니다." },
        { title: "보안과 권한", body: "\"이 화주의 계약만 보여 준다\" 같은 규칙을 시스템마다 다른 권한 모델로 다섯 번 구현해야 합니다.", here: "이 프로젝트: 검색 필터와 권한이 **한 모델**입니다." },
        { title: "응답 지연", body: "질문 하나에 여러 시스템을 오가면 네트워크 왕복이 쌓이고, 에이전트 응답이 느려집니다.", here: "이 프로젝트: 판정 한 번이 **DB 하나** 안에서 끝납니다." },
      ],
    },
    p2: {
      title: "RAG만으로는 왜 부족한가",
      note: "문서를 찾아 LLM에게 건네는 방식의 한계",
      points: [
        { title: "비슷한 글을 찾을 뿐, 판정하지 못합니다", body: "검색은 \"온도 이탈 통보\" 조항을 찾아 주지만, 그 조건이 지금 충족됐는지는 알려 주지 않습니다. 숫자 비교와 기한 계산을 LLM에게 맡기면 틀려도 알아채기 어렵습니다.", here: "이 프로젝트: 비교와 기한은 **엔진 코드**가 계산합니다." },
        { title: "센서 데이터와 연결되지 않습니다", body: "조항은 \"15분 연속\"이라고 말하지만, 실제로 몇 분이었는지는 문서에 없습니다. RAG는 문서만 보기 때문에 측정값에서 사건을 찾지 못합니다.", here: "이 프로젝트: 조항이 기다리는 사건을 **readings에서 계산**합니다." },
        { title: "엉뚱한 조항이 섞입니다", body: "뜻이 비슷하면 다른 화주의 계약, 옛 버전의 조항도 함께 올라옵니다. 어느 것이 이 배송에 적용되는지 LLM이 골라야 합니다.", here: "이 프로젝트: 적용 조항은 **계약 버전과 화물 분류**로 정확히 고릅니다." },
        { title: "조항 사이의 연결이 끊깁니다", body: "문서를 조각으로 자르면 \"6조가 발동하면 7조도\"라는 연결이 다른 조각에 있게 됩니다. 검색에 7조가 걸리지 않으면 해야 할 일이 빠집니다.", here: "이 프로젝트: 참조는 **references 필드**로 따라갑니다." },
        { title: "같은 질문에 다른 답이 나옵니다", body: "검색 결과의 순서나 개수가 조금만 바뀌어도 판단이 달라집니다. 왜 그런 답이 나왔는지 나중에 재현하기 어렵습니다.", here: "이 프로젝트: 같은 데이터면 **같은 판정**이고, 엔진 실행 기록이 남습니다." },
        { title: "\"없다\"를 말하지 못합니다", body: "습도 센서가 없어 판단할 수 없는 경우에도, 검색은 무언가를 찾아 오고 LLM은 그럴듯하게 답합니다.", here: "이 프로젝트: 데이터가 없으면 **\"확인 필요\"**로 따로 표시합니다." },
      ],
    },
    p3: {
      title: "데이터별로: 어떻게 모델링했고, MongoDB가 무엇을 받쳐 주나",
      note: "문제 → 모델링 → MongoDB가 받쳐 주는 것 → 그래서",
      stories: {
        ts: { name: "센서 시계열", tag: "Time Series · $setWindowFields",
          problem: "리퍼 센서가 1분마다 온도, 전력, 문 상태를 보냅니다. 계약 조건은 \"4 °C 초과가 **15분 연속**\"처럼 시간 순서와 연속성을 따집니다.",
          model: "측정 1건을 문서 1개로 둡니다. 어느 배송, 어느 리퍼, 그때의 허용 온도는 `meta`에 함께 넣습니다. \"사건\"은 따로 저장하지 않고, 필요할 때 측정값에서 계산합니다.",
          mongo: ["**Time Series 컬렉션**: `timeField`와 `metaField`를 지정하면 내부에서 시간 단위로 묶어 압축 저장합니다.", "**$setWindowFields + $shift**: 정렬된 측정값에 \"직전 측정 시각\"을 붙여 연속 구간을 DB 안에서 나눕니다.", "**meta 기준 인덱스**: 배송 하나, 기간 하나만 빠르게 읽습니다."],
          result: "사건 테이블과 그걸 채우는 배치 작업이 없습니다. 측정값이 고쳐지면 다음 판정에 바로 반영됩니다.",
          caption: "readings 문서 하나 (1분 1건)", caption2: "연속 구간 나누기 (detection.run_pipeline)" },
        doc: { name: "계약 규칙", tag: "문서 모델",
          problem: "계약 조항은 모양이 제각각입니다. 조건이 두 개인 조항, 다른 조항이 발동하면 따라오는 조항, 기한이 없는 권고가 섞여 있습니다.",
          model: "조항 1개를 문서 1개로, 모양 그대로 둡니다. 조건(`trigger`), 행동(`action`), 기한(`deadline`), 원문 위치(`chunkId`)를 한 문서에 담습니다.",
          mongo: ["**유연한 스키마**: 필드 구성이 다른 문서를 한 컬렉션에 둡니다. 필요하면 JSON Schema 검증을 겁니다.", "**배열 인덱스**: `appliesTo` 같은 배열 필드도 원소 단위로 색인합니다."],
          result: "새 계약 유형이 생겨도 테이블을 추가하거나 바꾸지 않습니다. 규칙을 읽을 때 조인이 필요 없습니다.",
          caption: "모양이 다른 조항 세 개 (같은 컬렉션)" },
        onto: { name: "온톨로지", tag: "정의도 데이터로",
          problem: "\"배송은 어느 컬렉션에 있고, 기간은 어느 필드로 정하나\", \"온도 이탈의 원인 후보는 무엇인가\" 같은 지식이 코드 곳곳에 박혀 있으면, 바꿀 때마다 코드를 고쳐야 합니다.",
          model: "타입, 관계, 사건, 행동을 `ontology` 컬렉션의 문서로 정의합니다. 로직은 넣지 않고 함수 **이름**만 둡니다. 화물 분류는 조상 목록을 미리 저장합니다.",
          mongo: ["**데이터와 같은 DB**: 엔진이 정의를 읽고 바로 같은 연결로 데이터를 읽습니다.", "**배열 + $in**: 조상 목록을 미리 저장해 \"수산물 전체에 적용되는 조항\"을 쿼리 한 번으로 찾습니다."],
          result: "정의를 고치면 엔진이 그대로 따라갑니다. 의약품 콜드체인 같은 다른 도메인도 같은 엔진에 정의만 바꿔 얹을 수 있습니다.",
          caption: "ontology 문서 두 개", caption2: "엔진은 이 정의로 \"어디서, 무엇을\" 읽을지 정합니다. 코드에는 컬렉션 이름이 없습니다." },
        lookup: { name: "판정 + 원문", tag: "$lookup",
          problem: "\"06:44까지 통보하라\"는 판정에는 그 근거가 되는 계약 원문이 붙어야 합니다. 원문을 검색으로 찾으면 비슷한 다른 조항이 나올 위험이 있습니다.",
          model: "조항 1개 = 원문 조각 1개. 조항 문서가 자기 조각의 `chunkId`를 정확히 가리킵니다.",
          mongo: ["**$lookup**: 적용 조항을 고르는 같은 집계 안에서 `knowledge`의 원문을 키로 붙입니다.", "필요한 필드(`source`, `text`)만 가져오도록 파이프라인으로 줄입니다."],
          result: "판정과 원문이 한 쿼리에서 나옵니다. 근거는 언제나 정확히 그 조항이고, LLM이 원문을 찾으려고 도구를 한 번 더 부르지 않습니다.",
          caption: "clauses → knowledge, 키로 연결" },
        graph: { name: "조항 참조", tag: "$graphLookup",
          problem: "\"6조가 발동하면 하역 전에 7조 검수도 해야 한다\"처럼 조항이 조항을 참조합니다. 발동한 조항에서 출발해 따라오는 조항을 모두 찾아야 합니다.",
          model: "따라오는 조항이 기대는 조항을 `references` 배열로 가리킵니다 (7조 → 6조).",
          mongo: ["**$graphLookup**: 같은 컬렉션 안에서 참조를 거꾸로, 여러 단계까지 따라갑니다. `maxDepth`로 깊이를 제한하고 `depthField`로 몇 단계인지 남깁니다."],
          result: "이 정도 깊이(1~2단계)의 참조는 그래프 DB를 따로 두지 않고 규칙과 같은 곳에서 탐색합니다.",
          caption: "참조 그래프 (화살표 = references)" },
        vec: { name: "문서 검색", tag: "Voyage AI · Atlas Vector Search",
          problem: "\"참치 하역 때 문을 얼마나 열어 둬도 되나\"는 어느 문서의 어느 조항인지 모르는 질문입니다. 그리고 다른 화주의 계약은 근거로 보여 주면 안 됩니다.",
          model: "문서 조각 하나에 원문, 임베딩 벡터, 그리고 **누구의 무슨 문서인지**(`contractId`, `version`, `docType`, `appliesTo`)를 함께 둡니다.",
          mongo: ["**Voyage AI**: MongoDB의 임베딩 모델이 문서 조각과 질문을 같은 벡터 공간으로 바꿉니다.", "**$vectorSearch**: 뜻이 가까운 조각을 찾습니다.", "**filter**: 검색 단계 안에서 메타데이터로 범위를 먼저 좁힙니다. 그 배송의 계약 버전과 그 화물의 SOP만 남깁니다."],
          result: "임베딩 모델과 벡터 저장·검색이 한 회사의 스택이고, 의미 검색과 접근 범위 제한이 한 쿼리입니다. 벡터만 따로 담는 저장소와 그 동기화가 필요 없습니다.",
          caption: "knowledge 문서 하나", caption2: "강조한 필드가 검색 필터가 됩니다. 원문과 벡터와 필터가 한 문서에 있습니다." },
        ckpt: { name: "대화 상태", tag: "LangGraph MongoDBSaver",
          problem: "\"그럼 화주가 인수를 거부할 수 있어?\" 같은 후속 질문은 앞의 질문과 도구 결과를 기억해야 답할 수 있습니다.",
          model: "대화(thread)마다 메시지와 도구 결과를 체크포인트 문서로 남깁니다.",
          mongo: ["LangGraph의 **MongoDBSaver**가 같은 클러스터에 저장합니다. 별도 캐시나 KV 저장소가 필요 없습니다."],
          result: "대화 기록도 운영 데이터와 같은 백업, 같은 권한 아래 있습니다.",
          caption: "설정 한 줄" },
      },
    },
    p4: {
      title: "MongoDB가 맡는 일과 맡지 않는 일",
      note: "무엇이든 DB에 넣는 것이 답은 아닙니다",
      does: "MongoDB가 맡는 일",
      doesNot: "MongoDB가 맡지 않는 일",
      who: "누가 맡나",
      doesRows: [
        ["운영 데이터 저장", "배송, 계약 조항, 온톨로지 정의"],
        ["센서 시계열과 사건 계산", "측정값 저장, 연속 구간과 추세 집계"],
        ["사실 조회와 연결", "적용 조항 선택, 원문 조인($lookup), 참조 탐색($graphLookup)"],
        ["임베딩 생성", "MongoDB의 임베딩 모델(voyage-4)이 문서 조각과 질문을 벡터로 바꿉니다. DB 엔진 안이 아니라 API로 호출합니다.", "Voyage AI"],
        ["의미 검색", "문서 조각 벡터 검색과 접근 범위 필터"],
        ["에이전트 상태", "대화별 메시지와 도구 결과"],
      ],
      notRows: [
        ["질문 이해와 답변 작성", "LLM", "어떤 도구를 부를지 고르고, 결과를 문장으로 씁니다."],
        ["발동 여부 판정", "애플리케이션 코드", "\"24분 ≥ 15분이면 발동\"은 rules.py가 정합니다. DB는 24분이라는 사실을 계산해 주고, 결정은 테스트할 수 있는 코드에 둡니다."],
        ["실제 조치 실행", "업무 시스템", "화주 통보, 정비 작업 지시는 하지 않습니다. 이 데모는 읽기 전용이고, 무엇을 해야 하는지만 알려 줍니다."],
        ["센서 수집과 전송", "IoT 게이트웨이 · 스트리밍", "현장 장비에서 데이터를 받아 오는 부분은 범위 밖입니다. 데모는 seed로 72시간을 만듭니다."],
        ["크고 깊은 그래프 분석", "그래프 엔진", "수백만 노드의 경로 탐색이나 그래프 알고리즘이 필요해지면 전용 엔진이 맞습니다. 여기 참조는 1~2단계라 $graphLookup으로 충분합니다."],
      ],
    },
    d: {
      app: "앱 + AI 에이전트", drivers5: "드라이버 5개 · 쿼리 언어 5개", drivers1: "드라이버 1개 · 쿼리 언어 1개",
      rdb: "관계형 DB", rdbS: "배송·계약·규칙", tsdb: "시계열 DB", tsdbS: "센서 측정값", vdb: "벡터 DB", vdbS: "문서 조각 임베딩",
      gdb: "그래프 DB", gdbS: "조항 간 참조", kv: "캐시 / KV", kvS: "대화 상태", own: "전용 쿼리 언어", api: "전용 API", cmds: "전용 명령",
      reindex: "재색인", ruleSync: "규칙 변경 동기화", syncLegend: "빨간 점선 = 직접 만들고 지켜야 하는 동기화",
      cluster: "MongoDB Atlas · 하나의 클러스터", oneOps: "백업 · 권한 · 모니터링 하나", embed: "임베딩 · MongoDB",
      docs: "문서", defs: "정의 문서", rules: "규칙 + $graphLookup", ts: "Time Series", vec: "원문 + Vector Search", state: "대화 상태",
      onePipe: "조인 · 그래프 · 벡터 · 시계열을 같은 집계 파이프라인 안에서", oneLookup: "clauses → knowledge 는 $lookup 한 단계", noSync: "동기화 파이프라인 없음",
      ragOnly: "RAG만 쓸 때", ours: "이 프로젝트", q: "질문", qEx: "\"RF-02는 뭘 해야 해?\"", search: "벡터 검색", searchS: "비슷한 조각 k개",
      judge: "LLM이 읽고 판단", judgeS: "조건 비교 · 기한 계산도 LLM", bad: "그럴듯하지만 확인할 수 없는 답", badS: "센서 데이터를 보지 않았고, 근거가 흔들림",
      engine: "엔진", engineS: "온톨로지 · 규칙 · 센서", verdict: "판정 + 정확한 원문", verdictS: "24분 ≥ 15분 · 06:44 · 6조 원문",
      good: "LLM은 전달만 · 근거를 인용", goodS: "같은 질문엔 같은 판정", ragNote: "벡터 검색은 \"어느 문서에 있는지 모르는 문구\"를 찾을 때만 씁니다 (예: 참치 하역 때 문 열림 허용 시간).",
      above: "기준을 넘은 측정값만 남긴 뒤", run1: "구간 1", run2: "구간 2", gap: "간격", shift: "$shift로 직전 시각을 붙이고, 간격이 벌어지면 새 구간",
      art6: "6조 통보", art6S: "발동 · 출발점", art7: "7조 검수", art7S: "references: [6조]", art8: "8조 보류", art8S: "참조 없음",
    },
  },
  en: {
    lead: "The cold-chain copilot works with sensor time series, contract rules, references between rules, document search, and agent conversations. Usually each of these goes into a different database. This page explains what gets hard when you do that, why RAG alone is not enough, how this project models each kind of data, and what MongoDB does not do here.",
    beats: { problem: "Problem", model: "Model", mongo: "MongoDB", result: "Result" },
    p1: {
      title: "The usual setup, and this project's",
      note: "Where the data lives when you build the same features",
      common: "Usual setup · one database per kind of data",
      commonSub: "Each feature gets a store specialized for it.",
      ours: "This project · one MongoDB Atlas",
      oursSub: "The kinds of data stay different; they are collections in one cluster.",
      points: [
        { title: "Operations", body: "Five databases means five deployments, backups, monitoring setups, upgrades, and incident playbooks. The team has to know five systems.", here: "This project: **one cluster** to run." },
        { title: "Synchronization", body: "When a contract clause changes, the relational, vector, and graph stores all need re-syncing. If one lags, the verdict uses the new clause while the evidence search returns the old one.", here: "This project: clauses and their text are in **the same database**, so there is nothing to sync." },
        { title: "Consistent evidence", body: "When a verdict and its evidence come from different systems at different moments, explaining a verdict in an audit gets hard.", here: "This project: the verdict and the text come from **one query**." },
        { title: "Cost", body: "Each system brings its own infrastructure and licences, and the same clause is stored three times. People's learning cost grows with every system too.", here: "This project: each clause lives in **one place**." },
        { title: "Security and access", body: "A rule like \"show only this shipper's contract\" has to be built five times, in five different access models.", here: "This project: the search filter and access live in **one model**." },
        { title: "Latency", body: "One question that crosses several systems piles up network round trips, and the agent answers slower.", here: "This project: a verdict is computed inside **one database**." },
      ],
    },
    p2: {
      title: "Why RAG alone is not enough",
      note: "The limits of finding passages and handing them to an LLM",
      points: [
        { title: "It finds similar text; it does not decide", body: "Search finds the \"notify on temperature excursion\" clause but cannot say whether its condition is met now. Leave the comparisons and deadlines to the LLM and mistakes are hard to spot.", here: "This project: comparisons and deadlines are computed by **engine code**." },
        { title: "It never sees the sensor data", body: "The clause says \"15 consecutive minutes\"; how many minutes it really was is not in any document. RAG only reads documents, so it cannot find incidents in the readings.", here: "This project: the events a clause waits on are **computed from readings**." },
        { title: "The wrong clauses get mixed in", body: "Anything similar comes back: another shipper's contract, an old version. The LLM has to guess which one applies to this shipment.", here: "This project: applicable clauses are picked exactly by **contract version and cargo class**." },
        { title: "Links between clauses break", body: "Chunking puts \"when Art. 6 triggers, Art. 7 applies\" in a different chunk. If the search misses Art. 7, a required action goes missing.", here: "This project: references are followed through the **references field**." },
        { title: "The same question gets different answers", body: "A small change in the order or number of search hits changes the judgment, and it is hard to reproduce why an answer came out.", here: "This project: the same data gives **the same verdict**, and the engine leaves a trace." },
        { title: "It cannot say \"there is no data\"", body: "Even when no humidity sensor exists to decide with, search still returns something and the LLM still answers plausibly.", here: "This project: missing data is marked **\"needs confirmation\"**." },
      ],
    },
    p3: {
      title: "Per kind of data: how it is modeled, and what MongoDB provides",
      note: "Problem → model → what MongoDB provides → result",
      stories: {
        ts: { name: "Sensor time series", tag: "Time Series · $setWindowFields",
          problem: "Reefer sensors send temperature, power, and door state every minute. Contract conditions depend on order and continuity: \"above 4 °C for **15 consecutive minutes**\".",
          model: "One reading is one document. Which shipment, which reefer, and the allowed temperature at that moment go in `meta`. Incidents are not stored; they are computed from readings when needed.",
          mongo: ["**Time Series collections**: with `timeField` and `metaField` set, readings are bucketed by time and compressed internally.", "**$setWindowFields + $shift**: each sorted reading gets the time of the previous one, so runs are split inside the database.", "**Indexes on meta**: one shipment over one period reads fast."],
          result: "No incident table and no batch job to fill it. A corrected reading changes the next verdict immediately.",
          caption: "One readings document (one per minute)", caption2: "Splitting runs (detection.run_pipeline)" },
        doc: { name: "Contract rules", tag: "Document model",
          problem: "Clauses come in different shapes: two conditions, one that follows another clause, a recommendation with no deadline.",
          model: "One clause is one document, in its own shape: condition (`trigger`), action (`action`), deadline (`deadline`), and where its text is (`chunkId`).",
          mongo: ["**Flexible schema**: documents with different fields share a collection; add JSON Schema validation when needed.", "**Array indexes**: array fields such as `appliesTo` are indexed per element."],
          result: "A new kind of contract needs no new or changed tables, and reading a rule needs no join.",
          caption: "Three clauses of different shapes (one collection)" },
        onto: { name: "Ontology", tag: "Definitions as data",
          problem: "Knowledge such as \"which collection holds shipments and which fields bound their period\" or \"what can cause a temperature excursion\", scattered through the code, means a code change for every change.",
          model: "Types, links, events, and actions are documents in the `ontology` collection. No logic, only function **names**. Each cargo class stores its ancestors.",
          mongo: ["**Same database as the data**: the engine reads a definition and then the data over the same connection.", "**Arrays + $in**: stored ancestors find \"clauses for all seafood\" in one query."],
          result: "Change a definition and the engine follows. Another domain, such as pharmaceutical cold chain, can reuse the engine with different definitions.",
          caption: "Two ontology documents", caption2: "The engine reads where and what from these definitions; the code names no collection." },
        lookup: { name: "Verdict + source text", tag: "$lookup",
          problem: "\"Notify by 06:44\" needs the contract text it rests on. Finding that text by search risks returning a similar, different clause.",
          model: "One clause = one text chunk. The clause names its chunk exactly with `chunkId`.",
          mongo: ["**$lookup**: inside the same aggregation that selects the clauses, the text from `knowledge` is joined by key.", "A sub-pipeline keeps only the fields needed (`source`, `text`)."],
          result: "The verdict and its text come from one query. The evidence is always exactly that clause, and the LLM makes no extra tool call to fetch it.",
          caption: "clauses → knowledge, joined by key" },
        graph: { name: "Clause references", tag: "$graphLookup",
          problem: "Clauses reference clauses: \"when Art. 6 triggers, inspect before unloading (Art. 7)\". From a triggered clause, every clause that follows must be found.",
          model: "A following clause points to the clause it relies on in a `references` array (Art. 7 → Art. 6).",
          mongo: ["**$graphLookup**: follows references backwards within the collection over several hops; `maxDepth` bounds it and `depthField` records the hop."],
          result: "References this shallow (one or two hops) are walked where the rules live, without a separate graph database.",
          caption: "Reference graph (arrow = references)" },
        vec: { name: "Document search", tag: "Voyage AI · Atlas Vector Search",
          problem: "\"How long may the door stay open while unloading tuna?\" — nobody knows which document or article answers it. And another shipper's contract must never be shown as evidence.",
          model: "Each chunk holds its text, its embedding, and **whose document it is** (`contractId`, `version`, `docType`, `appliesTo`).",
          mongo: ["**Voyage AI**: MongoDB's embedding models put chunks and questions into the same vector space.", "**$vectorSearch**: finds the chunks closest in meaning.", "**filter**: narrows by metadata inside the search stage, keeping only the shipment's contract version and its cargo's SOPs."],
          result: "Embedding models and vector storage and search come from one vendor's stack, and semantic search and access scoping are one query. No separate vector store, no sync.",
          caption: "One knowledge document", caption2: "The highlighted fields become the search filter. Text, vector, and filter live in one document." },
        ckpt: { name: "Conversation state", tag: "LangGraph MongoDBSaver",
          problem: "A follow-up such as \"Can the shipper refuse delivery, then?\" needs the earlier question and tool results.",
          model: "Each thread's messages and tool results are saved as checkpoint documents.",
          mongo: ["LangGraph's **MongoDBSaver** stores them in the same cluster. No separate cache or KV store."],
          result: "Conversations sit under the same backups and access as the operational data.",
          caption: "One line of setup" },
      },
    },
    p4: {
      title: "What MongoDB does here, and what it does not",
      note: "Putting everything in the database is not the answer",
      does: "MongoDB does",
      doesNot: "MongoDB does not",
      who: "who does",
      doesRows: [
        ["Store operational data", "Shipments, contract clauses, ontology definitions"],
        ["Sensor time series and incidents", "Store readings; aggregate runs and trends"],
        ["Look up and connect facts", "Select applicable clauses, join their text ($lookup), follow references ($graphLookup)"],
        ["Create embeddings", "MongoDB's embedding model (voyage-4) turns chunks and questions into vectors, called as an API rather than inside the database engine.", "Voyage AI"],
        ["Semantic search", "Vector search over chunks, with access filters"],
        ["Agent state", "Messages and tool results per conversation"],
      ],
      notRows: [
        ["Understand questions, write answers", "LLM", "Chooses which tools to call and writes the results as text."],
        ["Decide whether a clause triggers", "Application code", "\"24 min ≥ 15 min, so it triggers\" is decided in rules.py. The database computes the 24 minutes; the decision stays in code that can be tested."],
        ["Carry out actions", "Business systems", "No notices are sent and no work orders opened. The demo is read-only and says what must be done."],
        ["Collect sensor data", "IoT gateway · streaming", "Getting data off the equipment is out of scope; the demo seeds 72 hours."],
        ["Large, deep graph analytics", "Graph engine", "Path search over millions of nodes or graph algorithms call for a dedicated engine. References here are one or two hops, which $graphLookup handles."],
      ],
    },
    d: {
      app: "App + AI agent", drivers5: "5 drivers · 5 query languages", drivers1: "1 driver · 1 query language",
      rdb: "Relational DB", rdbS: "shipments · rules", tsdb: "Time series DB", tsdbS: "sensor readings", vdb: "Vector DB", vdbS: "chunk embeddings",
      gdb: "Graph DB", gdbS: "clause references", kv: "Cache / KV", kvS: "conversation state", own: "own query language", api: "own API", cmds: "own commands",
      reindex: "re-index", ruleSync: "sync on rule change", syncLegend: "Red dashes = sync you build and keep running",
      cluster: "MongoDB Atlas · one cluster", oneOps: "one backup · access · monitoring", embed: "embeddings · MongoDB",
      docs: "documents", defs: "definitions", rules: "rules + $graphLookup", ts: "Time Series", vec: "text + Vector Search", state: "conversation state",
      onePipe: "joins · graph · vectors · time series in one aggregation pipeline", oneLookup: "clauses → knowledge is one $lookup stage", noSync: "no sync pipelines",
      ragOnly: "RAG only", ours: "This project", q: "Question", qEx: "\"What must RF-02 do?\"", search: "Vector search", searchS: "k similar chunks",
      judge: "LLM reads and judges", judgeS: "comparisons and deadlines too", bad: "Plausible, but cannot be checked", badS: "never saw the sensor data; evidence shifts",
      engine: "Engine", engineS: "ontology · rules · sensors", verdict: "Verdict + exact text", verdictS: "24 ≥ 15 min · 06:44 · Art. 6 text",
      good: "LLM only relays, citing sources", goodS: "same question, same verdict", ragNote: "Vector search is used only to find wording when the document is unknown (e.g. how long the door may stay open while unloading tuna).",
      above: "Keep only the readings above the limit", run1: "run 1", run2: "run 2", gap: "gap", shift: "$shift adds the previous time; a gap starts a new run",
      art6: "Art. 6 notify", art6S: "triggered · start", art7: "Art. 7 inspect", art7S: "references: [Art. 6]", art8: "Art. 8 hold", art8S: "no references",
    },
  },
};
