// App shell: the app bar with Home and the four tabs, a live clock, and the language switch.

import { useEffect, useState } from "react";

import Architecture from "./architecture/Architecture";
import Home from "./home/Home";
import type { LastRun } from "./architecture/content";
import { type Language, saveLanguage, savedLanguage, text } from "./i18n";
import Ontology from "./ontology/Ontology";
import Operations from "./operations/Operations";
import WhyMongo from "./why/WhyMongo";

const TABS = ["home", "operations", "ontology", "architecture", "why"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  // Operations and Ontology stay mounted once opened, so the chat and the
  // graph layout survive a tab switch. Architecture reopens on the last question.
  const [opened, setOpened] = useState<Set<Tab>>(new Set(["operations"]));
  // A question clicked on Home, sent once the Operations chat picks it up.
  const [pending, setPending] = useState<string | null>(null);
  const t = text(language);

  const open = (id: Tab) => {
    setTab(id);
    setOpened((all) => new Set(all).add(id));
  };

  useFitToScreen();

  useEffect(() => {
    document.documentElement.lang = language;
    saveLanguage(language);
  }, [language]);

  const [title, description] = t.heads[tab];

  return (
    <>
      <header className="bar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="2" y="5" width="18" height="12" rx="2" fill="var(--accent-soft)" stroke="var(--edge)" strokeWidth="1.4" />
            <path d="M7 5v12M11 5v12M15 5v12" stroke="var(--edge)" strokeOpacity=".4" />
          </svg>
          <b>ColdChain <mark>Copilot</mark></b>
          <span>{t.brandSub}</span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => open(id)}>
              {t.tabs[id]}
            </button>
          ))}
        </nav>
        <LiveClock />
        <div className="lang" role="group" aria-label={t.language}>
          {(["en", "ko"] as const).map((code) => (
            <button key={code} type="button" aria-pressed={language === code} onClick={() => setLanguage(code)}>
              {code === "en" ? "EN" : "한국어"}
            </button>
          ))}
        </div>
      </header>
      <main>
        <section className="view" role="tabpanel">
          {tab !== "home" && (
            <div className="view-head">
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
          )}
          {tab === "home" && <Home language={language} onOpen={open} onAsk={(q) => { setPending(q); open("operations"); }} />}
          <div hidden={tab !== "operations"}>
            <Operations t={t} language={language} onRun={setLastRun} pending={pending} onPendingTaken={() => setPending(null)} />
          </div>
          {opened.has("ontology") && (
            <div hidden={tab !== "ontology"}>
              <Ontology t={t} />
            </div>
          )}
          {tab === "architecture" && <Architecture language={language} lastRun={lastRun} />}
          {tab === "why" && <WhyMongo language={language} />}
        </section>
      </main>
    </>
  );
}

/** "FLEET-01 · LIVE · 13:40:12 KST", ticking every second. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const kst = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour12: false });
  return (
    <span className="clock" aria-live="off">
      <i aria-hidden="true" />FLEET-01 · <b>LIVE</b> · {kst} KST
    </span>
  );
}

/** The screen the layout is designed for; other screens scale the whole app to fit it. */
const DESIGN = { width: 1600, height: 1000 };
const SCALE = { min: 0.7, max: 1.2 };

/**
 * Scales the whole app with CSS zoom so the design screen fits the window,
 * the way dashboards fit a wall display: smaller on a laptop, larger on a big
 * monitor. Below 900 px wide the layout stacks instead, at its natural size.
 */
function useFitToScreen() {
  useEffect(() => {
    const fit = () => {
      const { innerWidth: w, innerHeight: h } = window;
      const scale = w < 900 ? 1 : Math.min(SCALE.max, Math.max(SCALE.min, Math.min(w / DESIGN.width, h / DESIGN.height)));
      document.documentElement.style.setProperty("zoom", String(Math.round(scale * 100) / 100));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
}
