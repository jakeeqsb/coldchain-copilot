// Why MongoDB tab: five systems against one, then each feature this demo
// uses with the pipeline that uses it.

import type { Language } from "../i18n";
import { COPY, PIPELINES } from "./content";

export default function WhyMongo({ language }: { language: Language }) {
  const copy = COPY[language];
  return (
    <div className="why">
      <div className="why-compare">
        <section className="panel">
          <div className="panel-h"><h2>{copy.apart}</h2></div>
          <div className="panel-b stack">
            {copy.systems.map(([name, holds]) => (
              <div key={name} className="sys"><b>{name}</b><span>{holds}</span></div>
            ))}
            <div className="sys sync"><b>{copy.sync[0]}</b><span>{copy.sync[1]}</span></div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>{copy.together}</h2></div>
          <div className="panel-b">
            <div className="one">
              {copy.ours.map(([where, how]) => (
                <div key={where} className="row"><code>{where}</code><span>{how}</span></div>
              ))}
            </div>
            <p className="where">{copy.oursNote}</p>
          </div>
        </section>
      </div>
      <div className="feat">
        {copy.features.map((f) => (
          <section key={f.key} className="panel">
            <div className="panel-h"><h2>{f.title}</h2></div>
            <div className="panel-b">
              <p className="where"><code>{f.where}</code></p>
              <p>{f.why}</p>
              <pre>{PIPELINES[f.key]}</pre>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
