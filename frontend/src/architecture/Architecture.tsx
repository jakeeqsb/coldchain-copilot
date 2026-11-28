// Architecture tab: components and collections on a dark stage. Picking a
// flow lights the path a question takes; "last question" lights the path the
// question just asked in the Operations tab actually took. The flow's steps
// stay on the right; a step lights only its part, and a clicked component is
// explained below the steps without replacing them.

import { type KeyboardEvent, useState } from "react";

import type { Language } from "../i18n";
import { CARDS, COLLECTIONS, COPY, FLOWS, type Flow, ICONS, lastFlow, type LastRun, STEP_LIGHTS, WIRES } from "./content";

const FLOW_IDS = ["obligations", "briefing", "search", "last", "none"] as const;
type FlowId = (typeof FLOW_IDS)[number];

function labelPosition(wire: (typeof WIRES)[string]): [number, number, "start" | "middle" | "end"] {
  if (wire.at) return wire.at;
  const [, x1, y1, x2, y2] = wire.d.match(/M(\d+),(\d+) L(\d+),(\d+)/)!.map(Number);
  const vertical = x1 === x2;
  return [(x1 + x2) / 2 + (vertical ? 6 : 0), (y1 + y2) / 2 - (vertical ? 0 : 6), vertical ? "start" : "middle"];
}

export default function Architecture({ language, lastRun }: { language: Language; lastRun: LastRun | null }) {
  const copy = COPY[language];
  const [flowId, setFlowId] = useState<FlowId>(lastRun ? "last" : "obligations");
  const [picked, setPicked] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState<number | null>(null);

  const steps = STEP_LIGHTS[flowId];
  const whole: Flow | null = flowId === "none" ? null : flowId === "last" ? (lastRun ? lastFlow(lastRun) : null) : FLOWS[flowId];
  const flow: Flow | null = steps && stepIdx !== null ? steps[stepIdx] : whole;
  const goStep = (k: number | null) => setStepIdx(k === null || !steps ? null : Math.max(0, Math.min(steps.length - 1, k)));
  const on = (list: keyof Flow, id: string) => !!flow && flow[list].includes(id);
  const dim = (list: keyof Flow, id: string) => !!flow && !flow[list].includes(id);

  const pick = (id: string) => setPicked(id);
  const keyPick = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };

  return (
    <div className="work arch-work">
      <div className="stage">
        <div className="stage-bar">
          <b>Flow</b>
          {FLOW_IDS.map((id) => (
            <button key={id} type="button" className="pill" aria-pressed={flowId === id}
                    onClick={() => { setFlowId(id); setStepIdx(null); }}>
              {copy.flowNames[id]}
            </button>
          ))}
        </div>
        <div className="archwrap">
          <svg className="arch" viewBox="0 0 1000 640" role="img" aria-label={copy.zones.join(", ")}>
            {[22, 152, 292].map((y, i) => (
              <g key={y}>
                <rect className="zone" x="20" y={y} width="960" height="108" rx="6" />
                <text className="zl" x="32" y={y + 16}>{copy.zones[i]}</text>
              </g>
            ))}
            <rect className="slab" x="20" y="424" width="960" height="200" rx="10" />
            <text className="slab-t" x="38" y="448">{copy.zones[3]}</text>

            {Object.entries(WIRES).map(([id, wire]) => {
              const [x, y, anchor] = labelPosition(wire);
              const live = on("wires", id);
              return (
                <g key={id}>
                  <path className={`wire${live ? " live" : ""}${live && wire.db ? " db" : ""}${dim("wires", id) ? " dimmed" : ""}`} d={wire.d} />
                  <text className={`wl${live ? " live" : ""}`} x={x} y={y} textAnchor={anchor}>{wire.label}</text>
                </g>
              );
            })}

            {Object.entries(COLLECTIONS).map(([id, [x, name, sub]]) => (
              <g key={id} className={`coll${on("collections", id) ? " on" : ""}${picked === id ? " sel" : ""}`} tabIndex={0} role="button"
                 aria-label={name} onClick={() => pick(id)} onKeyDown={keyPick(id)}>
                <rect x={x} y="500" width="130" height="58" rx="6" />
                <text x={x + 65} y="525" textAnchor="middle">{name}</text>
                <text className="k" x={x + 65} y="543" textAnchor="middle">{sub}</text>
              </g>
            ))}
            <text className="wl" x="500" y="618" textAnchor="middle">{copy.slabNote}</text>

            {Object.entries(CARDS).map(([id, [x, y, w, icon, title, sub]]) => (
              <g key={id} className={`card${on("cards", id) ? " on" : ""}${dim("cards", id) ? " dimmed" : ""}${picked === id ? " sel" : ""}`}
                 tabIndex={0} role="button" aria-label={title} onClick={() => pick(id)} onKeyDown={keyPick(id)}>
                <rect className="body" x={x} y={y} width={w} height="66" rx="8" />
                <g transform={`translate(${x + 14},${y + 21})`}>
                  <path className="ic" d={ICONS[icon]} transform="scale(1.05)" />
                </g>
                <text className="t1" x={x + 50} y={y + 30}>{title}</text>
                <text className="t2" x={x + 50} y={y + 48}>{sub}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>
      <div className="arch-side">
        <aside className="panel inspector" aria-live="polite">
          <div className="panel-h"><h2>{copy.flow} · {copy.flowNames[flowId]}</h2></div>
          <div className="panel-b">
            {flowId === "last" ? (
              <LastRunDetail lastRun={lastRun} language={language} />
            ) : flowId === "none" || !steps ? (
              <p className="demo">{copy.pickHint}</p>
            ) : (
              <>
                <h3>{copy.flowTitles[flowId]}</h3>
                {stepIdx === null ? (
                  <>
                    <p className="intro">{copy.flowIntros[flowId]}</p>
                    <ol className="flowsteps compact">
                      {copy.flowSteps[flowId].map(([title], k) => (
                        <li key={title}>
                          <button type="button" className="fstep" onClick={() => goStep(k)}>
                            <span className="n">{k + 1}</span>
                            <span className="fs-t">{title}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="stepnav">
                      <button type="button" className="btn" onClick={() => goStep(0)}>{copy.start}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <ol className="flowsteps">
                      {copy.flowSteps[flowId].map(([title, detail], k) => (
                        <li key={title}>
                          <button type="button" className="fstep" aria-current={stepIdx === k ? "step" : undefined} onClick={() => goStep(k)}>
                            <span className="n">{k + 1}</span>
                            <span className="fs-t">{title}</span>
                            {stepIdx === k && <span className="fs-d">{detail}</span>}
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="stepnav">
                      <button type="button" className="btn ghost" onClick={() => goStep(stepIdx === 0 ? null : stepIdx - 1)}>
                        {stepIdx === 0 ? copy.overview : copy.prev}
                      </button>
                      <button type="button" className="btn" disabled={stepIdx === steps.length - 1} onClick={() => goStep(stepIdx + 1)}>{copy.next}</button>
                      <span className="stepcount">{stepIdx + 1} / {steps.length}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
        <aside className="panel inspector" aria-live="polite">
          <div className="panel-h"><h2>{copy.component}</h2></div>
          <div className="panel-b">
            {picked ? <ComponentDetail id={picked} language={language} /> : <p className="demo">{copy.pickHint}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ComponentDetail({ id, language }: { id: string; language: Language }) {
  const copy = COPY[language];
  const d = copy.details[id];
  return (
    <>
      <h3>{d.name}</h3>
      <p className="role">{d.role}</p>
      <h4>{copy.code}</h4>
      <pre>{d.code}</pre>
      <h4>{copy.does}</h4>
      <ul>
        {d.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </>
  );
}

function LastRunDetail({ lastRun, language }: { lastRun: LastRun | null; language: Language }) {
  const copy = COPY[language];
  if (!lastRun) return <p className="demo">{copy.lastEmpty}</p>;
  return (
    <>
      <h3>{copy.lastTitle}</h3>
      <h4>{copy.lastTools}</h4>
      <div className="rel">
        {lastRun.tools.length ? lastRun.tools.map((t, i) => <span key={i}>{t}</span>) : <span>–</span>}
      </div>
      <h4>{copy.lastCollections}</h4>
      <div className="rel">
        {lastRun.collections.length ? lastRun.collections.map((c) => <span key={c}>{c}</span>) : <span>–</span>}
      </div>
    </>
  );
}
