// Home tab: what the copilot is, the fleet right now, how it works, what to
// ask (a click asks it in Operations), and where each tab goes.

import { useEffect, useState } from "react";

import { api } from "../api";
import type { Language } from "../i18n";
import { verdict } from "../operations/Operations";
import { COPY, type TabId } from "./content";
import Emblem from "./Emblem";

type Live = { reefers: number; action: number; confirm: number; excursions: number };

const FLEET_ID = "FLEET-01";

export default function Home({ language, onOpen, onAsk }: {
  language: Language;
  onOpen: (tab: TabId) => void;
  onAsk: (question: string) => void;
}) {
  const c = COPY[language];
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const fleet = await api.fleet(FLEET_ID);
      const results = await Promise.all(fleet.shipments.map((row) => api.obligations(row.shipmentId)));
      const kinds = results.map((o) => verdict(o.results).kind);
      if (on) setLive({
        reefers: fleet.shipments.length,
        action: kinds.filter((k) => k === "triggered").length,
        confirm: kinds.filter((k) => k === "unresolved").length,
        excursions: fleet.shipments.reduce((sum, row) => sum + row.excursionCount, 0),
      });
    })().catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const figures: [string, number | undefined, string][] = [
    [c.reefers, live?.reefers, ""],
    [c.action, live?.action, "t"],
    [c.confirm, live?.confirm, "u"],
    [c.excursions, live?.excursions, "t"],
  ];

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p>{c.lead}</p>
          <div className="hero-go">
            <button type="button" className="btn" onClick={() => onOpen("operations")}>{c.open} →</button>
            <button type="button" className="btn ghost" onClick={() => onOpen("ontology")}>{c.openOntology}</button>
          </div>
        </div>
        <Emblem />
      </section>

      <section className="panel live">
        <div className="panel-h"><h2>{c.live}</h2><span className="stats">{c.liveNote}</span></div>
        <div className="panel-b live-figs">
          {figures.map(([label, value, kind]) => (
            <button key={label} type="button" className={`lf ${value ? kind : ""}`} onClick={() => onOpen("operations")}>
              <small>{label}</small>
              <b>{value ?? "–"}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="home-sec">
        <h2>{c.how}</h2>
        <ol className="how">
          {c.steps.map(([name, tech, text], i) => (
            <li key={name}>
              <span className="n">{i + 1}</span>
              <b>{name}</b>
              <code>{tech}</code>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-sec">
        <h2>{c.ask} <small>{c.askNote}</small></h2>
        <div className="levels">
          {c.levels.map(([level, question, how]) => (
            <button key={level} type="button" className="lv" onClick={() => onAsk(question)}>
              <small>{level}</small>
              <span>{question}</span>
              <code>{how}</code>
            </button>
          ))}
        </div>
      </section>

      <section className="home-sec">
        <h2>{c.tour}</h2>
        <Route copy={c} onOpen={onOpen} />
      </section>

      <section className="home-sec">
        <h2>{c.principles}</h2>
        <div className="rules">
          {c.rules.map(([title, text]) => (
            <div key={title}><b>{title}</b><p>{text}</p></div>
          ))}
        </div>
        <p className="stack">{c.stack}</p>
      </section>
    </div>
  );
}

/**
 * The tabs as stops on a cold-chain route: a reefer travels the line, the
 * stop under the pointer (or keyboard focus) shows its description below,
 * and a click opens the tab.
 */
function Route({ copy, onOpen }: { copy: (typeof COPY)["en"]; onOpen: (tab: TabId) => void }) {
  const ids = Object.keys(copy.tabs) as TabId[];
  const [hover, setHover] = useState<TabId>(ids[0]);
  const [name, text] = copy.tabs[hover];
  return (
    <div className="route">
      <div className="line">
        <span className="reefer" aria-hidden="true">
          <svg viewBox="0 0 34 22"><rect x="1" y="1" width="32" height="20" rx="2.5" /><path d="M9 3v13M17 3v13M25 3v13" /><rect className="lamp" x="1.6" y="15" width="30.8" height="5.4" /></svg>
        </span>
        {ids.map((id, i) => (
          <button key={id} type="button" className="stop" aria-current={hover === id ? "true" : undefined}
                  onMouseEnter={() => setHover(id)} onFocus={() => setHover(id)} onClick={() => onOpen(id)}>
            <span className="dot" />
            <small>{copy.stop} {String(i + 1).padStart(2, "0")}</small>
            <b>{copy.tabs[id][0]}</b>
            <span className="tag">{copy.tabs[id][2]}</span>
          </button>
        ))}
      </div>
      <div className="board" aria-live="polite">
        <span className="board-k">{name}</span>
        <p>{text}</p>
        <button type="button" className="btn" onClick={() => onOpen(hover)}>{copy.go}</button>
      </div>
    </div>
  );
}
