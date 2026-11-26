// Hand-drawn SVG diagrams for the Why MongoDB tab. Every label comes from the
// copy (`d`), so both languages draw the same picture.

type D = Record<string, string>;

function Box({ x, y, w, h, title, sub, lang, cls = "d-db" }: { x: number; y: number; w: number; h: number; title: string; sub?: string; lang?: string; cls?: string }) {
  return (
    <g>
      <rect className={cls} x={x} y={y} width={w} height={h} rx="6" />
      <text className="d-t" x={x + w / 2} y={y + 23} textAnchor="middle">{title}</text>
      {sub && <text className="d-s" x={x + w / 2} y={y + 38} textAnchor="middle">{sub}</text>}
      {lang && <text className="d-lang" x={x + w / 2} y={y + 58} textAnchor="middle">{lang}</text>}
    </g>
  );
}

/** Five databases joined by sync pipelines. */
export function CommonArchitecture({ d }: { d: D }) {
  return (
    <svg className="diagram" viewBox="0 0 520 380" role="img" aria-label={`${d.app}: ${d.rdb}, ${d.tsdb}, ${d.vdb}, ${d.gdb}, ${d.kv}`}>
      <Box x={170} y={14} w={180} h={46} title={d.app} sub={d.drivers5} cls="d-app" />
      {[[190, 66, 140], [225, 163, 230], [260, 260, 140], [295, 357, 230], [330, 454, 140]].map(([from, to, y]) => (
        <path key={from} className="d-wire" d={`M${from},60 L${to},${y}`} />
      ))}
      <Box x={8} y={140} w={116} h={70} title={d.rdb} sub={d.rdbS} lang="SQL" />
      <Box x={105} y={230} w={116} h={70} title={d.tsdb} sub={d.tsdbS} lang={d.own} />
      <Box x={202} y={140} w={116} h={70} title={d.vdb} sub={d.vdbS} lang={d.api} />
      <Box x={299} y={230} w={116} h={70} title={d.gdb} sub={d.gdbS} lang="Cypher" />
      <Box x={396} y={140} w={116} h={70} title={d.kv} sub={d.kvS} lang={d.cmds} />
      <path className="d-sync" d="M124,175 L202,175" />
      <text className="d-sync-t" x="163" y="168" textAnchor="middle">{d.reindex}</text>
      <path className="d-sync" d="M60,210 C60,330 300,330 340,300" />
      <text className="d-sync-t" x="150" y="330" textAnchor="middle">{d.ruleSync}</text>
      <path className="d-sync" d="M124,195 C140,225 150,225 158,230" />
      <text className="d-sync-t" x="260" y="362" textAnchor="middle">{d.syncLegend}</text>
    </svg>
  );
}

/** One Atlas cluster holding every collection, with Voyage AI beside it. */
export function OurArchitecture({ d }: { d: D }) {
  const colls: [number, number, string, string][] = [
    [40, 150, "shipments", d.docs], [190, 150, "ontology", d.defs], [340, 150, "clauses", d.rules],
    [40, 216, "readings", d.ts], [190, 216, "knowledge", d.vec], [340, 216, "checkpoints", d.state],
  ];
  return (
    <svg className="diagram" viewBox="0 0 520 380" role="img" aria-label={`${d.app}: ${d.cluster}`}>
      <Box x={170} y={14} w={180} h={46} title={d.app} sub={d.drivers1} cls="d-app" />
      <path className="d-wire" d="M260,60 L260,110" />
      <Box x={372} y={14} w={128} h={46} title="Voyage AI" sub={d.embed} cls="d-mongo" />
      <path className="d-wire" d="M350,37 L372,37" />
      <path className="d-wire d-green" d="M436,60 L436,110" />
      <rect className="d-mongo" x="20" y="110" width="480" height="230" rx="10" />
      <text className="d-t" x="38" y="134">{d.cluster}</text>
      <text className="d-one" x="482" y="134" textAnchor="end">{d.oneOps}</text>
      {colls.map(([x, y, name, sub]) => (
        <g key={name}>
          <rect className="d-coll" x={x} y={y} width="140" height="56" rx="6" />
          <text className="d-t" x={x + 70} y={y + 23} textAnchor="middle">{name}</text>
          <text className="d-s" x={x + 70} y={y + 40} textAnchor="middle">{sub}</text>
        </g>
      ))}
      <text className="d-one" x="260" y="300" textAnchor="middle">{d.onePipe}</text>
      <text className="d-s" x="260" y="318" textAnchor="middle">{d.oneLookup}</text>
      <text className="d-one" x="260" y="362" textAnchor="middle">{d.noSync}</text>
    </svg>
  );
}

/** Two rows: RAG alone against this project. */
export function RagCompare({ d }: { d: D }) {
  const row = (y: number, boxes: [string, string, string][]) => {
    const xs = [20, 220, 440, 690], ws = [150, 170, 200, 290];
    return boxes.map(([title, sub, cls], k) => (
      <g key={title}>
        <Box x={xs[k]} y={y} w={ws[k]} h={50} title={title} sub={sub} cls={cls} />
        {k < 3 && <path className="d-wire" d={`M${xs[k] + ws[k]},${y + 25} L${xs[k + 1] - 2},${y + 25}`} />}
      </g>
    ));
  };
  return (
    <svg className="diagram" viewBox="0 0 1000 250" role="img" aria-label={`${d.ragOnly} / ${d.ours}`}>
      <text className="d-h" x="20" y="26">{d.ragOnly}</text>
      {row(40, [[d.q, d.qEx, "d-app"], [d.search, d.searchS, "d-box"], [d.judge, d.judgeS, "d-box"], [d.bad, d.badS, "d-box d-bad"]])}
      <text className="d-h" x="20" y="140">{d.ours}</text>
      {row(155, [[d.q, d.qEx, "d-app"], [d.engine, d.engineS, "d-mongo"], [d.verdict, d.verdictS, "d-mongo"], [d.good, d.goodS, "d-box d-good"]])}
      <text className="d-s" x="20" y="238">{d.ragNote}</text>
    </svg>
  );
}

/** Readings above the limit split into runs where the gap is too long. */
export function Runs({ d }: { d: D }) {
  const runs: [number, number, string, string][] = [[0, 9, d.run1, "var(--trig)"], [14, 23, d.run2, "var(--ok)"]];
  const x = (i: number) => 30 + i * 19;
  return (
    <svg className="mini" viewBox="0 0 520 110" role="img" aria-label={d.shift}>
      <line x1="10" x2="510" y1="60" y2="60" stroke="var(--line)" />
      <text className="d-s" x="10" y="18">{d.above}</text>
      {runs.map(([a, b, label, color]) => (
        <g key={label}>
          <rect x={x(a) - 9} y="44" width={(b - a) * 19 + 18} height="32" rx="6" fill="none" stroke={color} strokeDasharray="4 3" />
          <text x={x((a + b) / 2)} y="38" textAnchor="middle" fontSize="10" fontWeight="600" fill={color}>{label}</text>
          {Array.from({ length: b - a + 1 }, (_, k) => <circle key={k} cx={x(a + k)} cy="60" r="5" fill={color} />)}
        </g>
      ))}
      <text className="d-s" x={x(11.5)} y="64" textAnchor="middle">{d.gap}</text>
      <text className="d-s" x="10" y="100">{d.shift}</text>
    </svg>
  );
}

/** A clause's chunkId pointing at its knowledge chunk. */
export function LookupLink() {
  return (
    <svg className="mini" viewBox="0 0 520 150" role="img" aria-label="clauses.chunkId → knowledge.chunkId ($lookup)">
      <rect className="d-db" x="10" y="20" width="220" height="110" rx="8" />
      <text className="d-t" x="22" y="40">clauses</text>
      <text className="d-s" x="22" y="62">clauseId: "…-art6"</text>
      <text className="d-s" x="22" y="80">trigger · action · deadline</text>
      <rect className="d-key" x="18" y="92" width="200" height="22" rx="4" />
      <text className="d-t" x="26" y="107">chunkId: "…-article-6"</text>
      <rect className="d-db" x="290" y="20" width="220" height="110" rx="8" />
      <text className="d-t" x="302" y="40">knowledge</text>
      <rect className="d-key" x="298" y="48" width="200" height="22" rx="4" />
      <text className="d-t" x="306" y="63">chunkId: "…-article-6"</text>
      <text className="d-s" x="302" y="88">source: "BlueHarbor § Art. 6"</text>
      <text className="d-s" x="302" y="106">text: "If the internal …"</text>
      <path className="d-wire d-green" d="M218,103 C260,103 255,59 296,59" strokeWidth="1.8" />
      <polygon points="296,59 288,55 288,63" className="d-arrow" />
      <text className="d-one" x="257" y="142" textAnchor="middle">$lookup</text>
    </svg>
  );
}

/** Art. 7 references Art. 6; Art. 8 references nothing. */
export function RefGraph({ d }: { d: D }) {
  return (
    <svg className="mini" viewBox="0 0 520 150" role="img" aria-label={`${d.art7} → ${d.art6}`}>
      <rect className="d-hot" x="30" y="50" width="130" height="46" rx="8" />
      <text className="d-t" x="95" y="70" textAnchor="middle">{d.art6}</text>
      <text className="d-s d-red" x="95" y="86" textAnchor="middle">{d.art6S}</text>
      <rect className="d-db" x="300" y="18" width="160" height="46" rx="8" />
      <text className="d-t" x="380" y="38" textAnchor="middle">{d.art7}</text>
      <text className="d-s" x="380" y="54" textAnchor="middle">{d.art7S}</text>
      <rect className="d-db d-quiet" x="300" y="88" width="160" height="46" rx="8" />
      <text className="d-s" x="380" y="108" textAnchor="middle">{d.art8}</text>
      <text className="d-s" x="380" y="124" textAnchor="middle">{d.art8S}</text>
      <path className="d-wire d-green" d="M300,41 C230,41 230,62 162,68" strokeWidth="1.8" />
      <polygon points="162,68 171,63 170,72" className="d-arrow" />
      <text className="d-one" x="232" y="34" textAnchor="middle">depth 0</text>
    </svg>
  );
}
