// App shell: the app bar with the four tabs and the language switch.

import { useEffect, useState } from "react";

import { type Language, saveLanguage, savedLanguage, text } from "./i18n";
import Operations from "./operations/Operations";

const TABS = ["operations", "ontology", "architecture", "why"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("operations");
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const t = text(language);

  useEffect(() => {
    document.documentElement.lang = language;
    saveLanguage(language);
  }, [language]);

  const [title, description] = t.heads[tab];

  return (
    <>
      <header className="bar">
        <div className="brand">
          <b>ColdChain Copilot</b>
          <span>{t.brandSub}</span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {t.tabs[id]}
            </button>
          ))}
        </nav>
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
          <div className="view-head">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {tab === "operations" ? (
            <Operations t={t} language={language} />
          ) : (
            <div className="panel">
              <div className="panel-b empty">{t.comingSoon}</div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
