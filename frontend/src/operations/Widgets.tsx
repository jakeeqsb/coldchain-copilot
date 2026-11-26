// The charts and panels shown under an answer; answerCharts.ts decides which.

import type { Text } from "../i18n";
import type { Basis, Chunk, ClauseResult, Series, TraceStep } from "../types";
import type { FleetEntry, Widget } from "./answerCharts";
import { kstTime, ShipmentChart } from "./charts";
import { CHIP, verdict } from "./Operations";

const OPS: Record<string, string> = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=" };
const STATUS_CHIP: Record<string, string> = { triggered: "t", unresolved: "u", not_triggered: "n" };
const STATUS_ORDER: Record<string, number> = { triggered: 0, unresolved: 1, not_triggered: 2 };

export function Widgets({ widgets, series, t }: { widgets: Widget[]; series: Record<string, Series>; t: Text }) {
  return (
    <div className="widgets">
      {widgets.map((w, i) => {
        if (w.kind === "fleet") return <FleetWidget key={i} rows={w.rows} t={t} />;
        if (w.kind === "temperature") return <TemperatureWidget key={i} shipmentId={w.shipmentId} series={series[w.shipmentId]} t={t} />;
        if (w.kind === "obligations") return <ObligationsWidget key={i} shipmentId={w.shipmentId} results={w.results} t={t} />;
        if (w.kind === "documents") return <DocumentsWidget key={i} chunks={w.chunks} t={t} />;
        return <TraceWidget key={i} steps={w.steps} t={t} />;
      })}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="w">
      <h3>
        <span>{title}</span>
        {note && <span>{note}</span>}
      </h3>
      {children}
    </div>
  );
}

function FleetWidget({ rows, t }: { rows: FleetEntry[]; t: Text }) {
  return (
    <Card title={t.w.fleet} note={`${rows.length} ${t.w.shipments}`}>
      <div className="fleetstrip mini">
        {rows.map((row) => {
          const v = row.results ? verdict(row.results) : null;
          return (
            <div key={row.shipmentId} className={`fs ${v ? CHIP[v.kind] : ""}`}>
              <span className="fs-head">
                <b>{row.reeferId}</b>
                <span className="fs-id">{row.shipmentId}</span>
              </span>
              {v && (
                <span className={`chip ${CHIP[v.kind]}`}>
                  {t.status[v.kind]}
                  {v.count ? ` ${v.count}` : ""}
                </span>
              )}
              <span className={`fs-range${row.excursionCount ? " hot" : ""}`}>
                {t.excursions} {row.excursionCount}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TemperatureWidget({ shipmentId, series, t }: { shipmentId: string; series: Series | undefined; t: Text }) {
  return (
    <Card title={`${t.dash.temp} · ${shipmentId}`} note={t.window}>
      {series ? <ShipmentChart series={series} labels={t.dash} width={760} compact /> : <p className="empty">{t.loading}</p>}
    </Card>
  );
}

/** "BlueHarbor … § Article 6" → ["Article 6", "BlueHarbor …"]. */
function sourceParts(result: ClauseResult): [string, string] {
  const [doc, part] = (result.source ?? result.clauseId).split(" § ");
  return part ? [part, doc] : [doc, ""];
}

function basisText(basis: Basis, t: Text): string {
  if ("measure" in basis) return `${basis.measure} ${basis.actual ?? "–"} ${OPS[basis.op] ?? basis.op} ${basis.required}`;
  if ("dependsOn" in basis) return `${t.w.follows} ${basis.dependsOn}`;
  if ("noEvent" in basis) return `${t.w.noEvent}: ${basis.noEvent.replace("event:", "")}`;
  return `${t.w.missing}: ${basis.missingData.replace("event:", "")}`;
}

function ObligationsWidget({ shipmentId, results, t }: { shipmentId: string; results: ClauseResult[]; t: Text }) {
  const sorted = [...results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const dated = sorted.filter((r) => r.status === "triggered" && r.deadline && r.event);
  return (
    <Card title={`${t.w.obligations} · ${shipmentId}`} note={`${results.length} ${t.w.clauses}`}>
      {dated.length > 0 && <DeadlineTimeline results={dated} t={t} />}
      <ul className="clauses">
        {sorted.map((r) => {
          const [part, doc] = sourceParts(r);
          return (
            <li key={r.clauseId} className={r.status === "not_triggered" ? "quiet" : undefined}>
              <span className={`chip ${STATUS_CHIP[r.status]}`}>{t.w.status[r.status]}</span>
              <span className="cl-name">
                <b>{part}</b> <span className="muted">{doc}</span>
              </span>
              <span className="cl-action">
                {t.w.actions[r.action.type] ?? r.action.type}
                {r.action.party && <span className="mono muted"> · {r.action.party}</span>}
                {r.deadlineLocal && <span className="mono"> · {t.w.due} {r.deadlineLocal.slice(11)}</span>}
              </span>
              <span className="cl-basis">
                {r.basis.map((b, i) => (
                  <span key={i} className={"met" in b ? (b.met ? "met" : "unmet") : undefined}>
                    {basisText(b, t)}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** One bar per triggered clause with a deadline: from the event start to the deadline, with "now". */
function DeadlineTimeline({ results, t }: { results: ClauseResult[]; t: Text }) {
  const W = 640, L = 96, R = 70, row = 24, top = 18;
  const H = top + results.length * row + 22;
  const now = Date.now();
  const starts = results.map((r) => Date.parse(r.event!.start));
  const ends = results.map((r) => Date.parse(r.deadline!));
  const t0 = Math.min(...starts), t1 = Math.max(...ends, now);
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0 || 1)) * (W - L - R);
  return (
    <svg className="tl" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.w.deadlines}>
      {results.map((r, i) => {
        const y = top + i * row + row / 2;
        const start = starts[i], end = ends[i];
        return (
          <g key={r.clauseId}>
            <text x={L - 8} y={y + 4} textAnchor="end" className="b">{sourceParts(r)[0]}</text>
            <line className="rail" x1={L} x2={W - R} y1={y} y2={y} />
            <line className={end < now ? "span" : "span open"} x1={x(start)} x2={x(end)} y1={y} y2={y} />
            <text x={x(end) + 6} y={y + 4} className={end < now ? "r" : undefined}>{kstTime(end)}</text>
          </g>
        );
      })}
      <line className="due" x1={x(now)} x2={x(now)} y1={top - 6} y2={H - 18} />
      <text x={x(now)} y={top - 8} textAnchor="middle">{t.w.now} {kstTime(now)}</text>
      <text x={x(t0)} y={H - 4} textAnchor="start">{kstTime(t0)} {t.w.eventStart}</text>
    </svg>
  );
}

function DocumentsWidget({ chunks, t }: { chunks: Chunk[]; t: Text }) {
  return (
    <Card title={t.w.documents} note={`${chunks.length}`}>
      <ul className="docs">
        {chunks.map((c) => (
          <li key={c.chunkId}>
            <span className="doc-src">
              <b>{c.source}</b>
              {c.score !== undefined && <span className="mono muted">score {c.score.toFixed(3)}</span>}
            </span>
            <span className="doc-text">{c.text.replace(/^[^\n]*\n+/, "")}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The engine's six steps. A fleet briefing runs them once per shipment; those are added up per step. */
function TraceWidget({ steps, t }: { steps: TraceStep[]; t: Text }) {
  const byStep = new Map<string, TraceStep & { runs: number }>();
  for (const s of steps) {
    const seen = byStep.get(s.step);
    if (seen) Object.assign(seen, { count: seen.count + s.count, ms: seen.ms + s.ms, runs: seen.runs + 1 });
    else byStep.set(s.step, { ...s, runs: 1 });
  }
  const rows = [...byStep.values()];
  const runs = rows[0]?.runs ?? 1;
  const total = rows.reduce((sum, r) => sum + r.ms, 0);
  return (
    <Card title={t.w.trace} note={`${runs > 1 ? `${runs} × ` : ""}${total.toFixed(1)} ms`}>
      <ol className="trace">
        {rows.map((r, i) => (
          <li key={r.step}>
            <span className="n">{i + 1}</span>
            <span className="tr-step">{t.w.steps[r.step] ?? r.step}</span>
            <span className="tr-cols">
              {r.collections.length ? r.collections.map((c) => <code key={c}>{c}</code>) : <span className="muted">{t.w.inCode}</span>}
            </span>
            <span className="tr-feat">{r.features.join(", ")}</span>
            <span className="tr-num mono">{r.count}</span>
            <span className="tr-num mono">{r.ms.toFixed(1)} ms</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
