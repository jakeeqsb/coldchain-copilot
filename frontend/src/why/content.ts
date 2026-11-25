// What the Why MongoDB tab says. Each pipeline is copied from the code it
// names, shortened only where marked with "…".

import type { Language } from "../i18n";

export const PIPELINES: Record<string, string> = {
  timeSeries: `db.createCollection("readings", {
  timeseries: { timeField: "ts", metaField: "meta",
                granularity: "minutes" } })

{ $setWindowFields: {
    partitionBy: "$meta.shipmentId",
    sortBy: { ts: 1 },
    output: { prevTs: { $shift:
      { output: "$ts", by: -1 } } } } },
…
{ $group: {
    _id: { shipmentId: "$meta.shipmentId",
           runNo: "$runNo" },
    start: { $min: "$ts" },
    end:   { $max: "$ts" } } }`,
  vectorSearch: `{ $vectorSearch: {
    index: "knowledge_vector",
    path: "embedding",
    queryVector: [ …1024 floats… ],
    numCandidates: 100, limit: 4,
    filter: { $or: [
      { contractId: "blueharbor-live-fish",
        version: "v1" },
      { docType: { $ne: "contract" },
        appliesTo: { $in: classes } } ] } } }`,
  lookup: `{ $lookup: {
    from: "knowledge",
    localField: "chunkId",
    foreignField: "chunkId",
    pipeline: [{ $project:
      { _id: 0, source: 1, text: 1 } }],
    as: "chunk" } }`,
  graphLookup: `{ $graphLookup: {
    from: "clauses",
    startWith: "$clauseId",
    connectFromField: "clauseId",
    connectToField: "references",
    as: "dependents",
    maxDepth: 2, depthField: "depth" } }`,
  document: `{ trigger: {
    eventType: "event:door_opening",
    allOf: [{ measure: "doorOpenMinutes",
              op: "gt", value: 10 }] } }

{ trigger: {
    clauseTriggered: "blueharbor-live-fish-v1-art6" } }`,
  checkpoints: `MongoDBSaver(db.get_client(),
             db_name=settings.db_name)`,
};

type Feature = { key: string; title: string; where: string; why: string };
type Copy = {
  apart: string;
  together: string;
  systems: [string, string][];
  sync: [string, string];
  ours: [string, string][];
  oursNote: string;
  features: Feature[];
};

export const COPY: Record<Language, Copy> = {
  en: {
    apart: "Built separately · 5 systems",
    together: "This project · one MongoDB",
    systems: [
      ["Relational DB", "Shipments, contracts, clause rules"],
      ["Time series DB", "Reefer sensor readings"],
      ["Vector DB", "Contract and SOP chunks with embeddings"],
      ["Graph DB", "References between clauses"],
      ["Cache / KV", "Agent conversation state"],
    ],
    sync: ["+ sync", "Pipelines that re-align the vector and graph stores whenever a clause changes; a different query language and access model per system"],
    ours: [
      ["shipments · clauses · ontology", "Document model: rules and definitions stored as JSON"],
      ["readings", "Time Series, with aggregation to detect events"],
      ["knowledge", "$vectorSearch with a metadata filter"],
      ["clauses.references", "$graphLookup"],
      ["checkpoints", "LangGraph MongoDBSaver"],
    ],
    oursNote: "Rules (clauses) and their text (knowledge) live in the same database, so one $lookup stage attaches the source text to each verdict.",
    features: [
      { key: "timeSeries", title: "Time Series + aggregation", where: "readings · detection.run_pipeline",
        why: "Consecutive out-of-range readings are grouped into runs inside the database. Events are not stored, so a corrected reading changes the next verdict at once." },
      { key: "vectorSearch", title: "$vectorSearch", where: "knowledge · search_knowledge",
        why: "For questions where the document is not known. The filter keeps the shipment's own contract version and the SOPs for its cargo, so another shipper's contract is never cited." },
      { key: "lookup", title: "$lookup", where: "clauses → knowledge · ontology.applicable_clauses",
        why: "When the clause is known, its text is joined by key instead of searched. The verdict and the text it quotes come from one query, so the LLM needs no extra call to fetch the text." },
      { key: "graphLookup", title: "$graphLookup", where: "clauses.references · ontology.dependent_clauses",
        why: "Clauses reference clauses (\"when Art. 6 triggers, Art. 7 applies too\"). Followed in the database, without a separate graph store." },
      { key: "document", title: "Document model", where: "ontology · clauses",
        why: "Every rule has its own shape: how many conditions, a linked clause, a deadline or not. They go in as JSON, with no schema migration." },
      { key: "checkpoints", title: "Conversation state", where: "checkpoints · agent.build_agent",
        why: "The agent's conversation is saved in the same database, so a follow-up question can use earlier results." },
    ],
  },
  ko: {
    apart: "따로 만들면 · 5개 시스템",
    together: "이 프로젝트 · MongoDB 하나",
    systems: [
      ["관계형 DB", "배송, 계약, 조항 규칙"],
      ["시계열 DB", "리퍼 센서 측정값"],
      ["벡터 DB", "계약서·SOP 조각과 임베딩"],
      ["그래프 DB", "조항 간 참조"],
      ["캐시 / KV", "에이전트 대화 상태"],
    ],
    sync: ["+ 동기화", "조항이 바뀔 때 벡터 DB와 그래프 DB를 다시 맞추는 파이프라인, 시스템마다 다른 쿼리 언어와 권한"],
    ours: [
      ["shipments · clauses · ontology", "문서 모델. 규칙과 정의를 JSON 그대로"],
      ["readings", "Time Series + 집계로 이벤트 탐지"],
      ["knowledge", "$vectorSearch + 메타데이터 필터"],
      ["clauses.references", "$graphLookup"],
      ["checkpoints", "LangGraph MongoDBSaver"],
    ],
    oursNote: "규칙(clauses)과 원문(knowledge)이 같은 DB에 있어서, $lookup 한 단계로 판정마다 근거 원문을 붙입니다.",
    features: [
      { key: "timeSeries", title: "Time Series + 집계", where: "readings · detection.run_pipeline",
        why: "기준을 벗어난 연속 측정값을 DB 안에서 구간으로 묶습니다. 이벤트를 저장하지 않아서, 측정값이 고쳐지면 다음 판정에 바로 반영됩니다." },
      { key: "vectorSearch", title: "$vectorSearch", where: "knowledge · search_knowledge",
        why: "어느 문서인지 모르는 질문에 씁니다. 그 배송의 계약 버전과 화물 SOP만 필터해서, 다른 화주의 계약이 근거로 나오지 않습니다." },
      { key: "lookup", title: "$lookup", where: "clauses → knowledge · ontology.applicable_clauses",
        why: "어느 조항인지 알 때는 검색하지 않고 키로 조인합니다. 판정과 인용할 원문이 한 쿼리에서 나와서, LLM이 원문을 얻으려고 도구를 한 번 더 부르지 않아도 됩니다." },
      { key: "graphLookup", title: "$graphLookup", where: "clauses.references · ontology.dependent_clauses",
        why: "\"6조가 발동하면 7조도\"처럼 조항이 조항을 참조합니다. 별도 그래프 DB 없이 DB 안에서 따라갑니다." },
      { key: "document", title: "문서 모델", where: "ontology · clauses",
        why: "규칙마다 모양이 다릅니다 (조건 개수, 연결 조항, 기한 유무). 스키마 변경 없이 JSON 그대로 넣습니다." },
      { key: "checkpoints", title: "대화 상태", where: "checkpoints · agent.build_agent",
        why: "에이전트 대화도 같은 DB에 남아서, 후속 질문이 이전 결과를 씁니다." },
    ],
  },
};
