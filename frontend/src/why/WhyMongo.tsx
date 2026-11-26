// Why MongoDB tab: the two architectures, the limits of plain RAG, one
// modeling story per kind of data, and what MongoDB does and does not do.

import type { ReactNode } from "react";

import type { Language } from "../i18n";
import { COPY, DOCS, STORY_ORDER } from "./content";
import { CommonArchitecture, LookupLink, OurArchitecture, RagCompare, RefGraph, Runs } from "./diagrams";

/** Renders **bold** and `code` in a line of copy. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
        part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

const TOKEN = /("[^"]*")|(\/\/[^\n]*)|(-?\b\d+(?:\.\d+)?\b|\bnull\b|\bfalse\b|\btrue\b)|([A-Za-z_]\w*)(?=\s*:)/g;

/** Colors keys, strings, numbers, and comments; «…» marks highlighted fields. */
function Doc({ text, small }: { text: string; small?: boolean }) {
  const color = (chunk: string, base: number) => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of chunk.matchAll(TOKEN)) {
      if (m.index > last) out.push(chunk.slice(last, m.index));
      const cls = m[1] ? "s" : m[2] ? "c" : m[3] ? "n" : "k";
      out.push(<span key={base + m.index} className={cls}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    out.push(chunk.slice(last));
    return out;
  };
  return (
    <pre className={`doc${small ? " small" : ""}`}>
      {text.split(/(«[^»]*»)/g).map((part, i) =>
        part.startsWith("«") ? <mark key={i}>{color(part.slice(1, -1), i * 10000)}</mark> : <span key={i}>{color(part, i * 10000)}</span>,
      )}
    </pre>
  );
}

function Visual({ id, d }: { id: string; d: Record<string, string> }) {
  const doc = DOCS[id];
  if (id === "doc") return <div className="docs3">{(doc as string[]).map((t) => <Doc key={t} text={t} small />)}</div>;
  if (id === "lookup") return <LookupLink />;
  if (id === "graph") return <RefGraph d={d} />;
  return <Doc text={doc as string} />;
}

export default function WhyMongo({ language }: { language: Language }) {
  const c = COPY[language];
  return (
    <div className="why">
      <p className="why-lead">{c.lead}</p>

      <section className="part" aria-labelledby="why-p1">
        <Head no={1} id="why-p1" title={c.p1.title} note={c.p1.note} />
        <div className="arch2">
          <div className="wcard">
            <h3>{c.p1.common}</h3>
            <p className="sub">{c.p1.commonSub}</p>
            <CommonArchitecture d={c.d} />
          </div>
          <div className="wcard">
            <h3>{c.p1.ours}</h3>
            <p className="sub">{c.p1.oursSub}</p>
            <OurArchitecture d={c.d} />
          </div>
        </div>
        <Points points={c.p1.points} />
      </section>

      <section className="part" aria-labelledby="why-p2">
        <Head no={2} id="why-p2" title={c.p2.title} note={c.p2.note} />
        <div className="wcard"><RagCompare d={c.d} /></div>
        <Points points={c.p2.points} />
      </section>

      <section className="part" aria-labelledby="why-p3">
        <Head no={3} id="why-p3" title={c.p3.title} note={c.p3.note} />
        <nav className="toc">
          {STORY_ORDER.map((id) => <a key={id} href={`#why-${id}`}>{c.p3.stories[id].name}</a>)}
        </nav>
        {STORY_ORDER.map((id) => {
          const s = c.p3.stories[id];
          return (
            <article key={id} id={`why-${id}`} className="wcard story">
              <div>
                <h3>{s.name} <small>{s.tag}</small></h3>
                <div className="beats">
                  <div className="beat"><span className="k p">{c.beats.problem}</span><p><Inline text={s.problem} /></p></div>
                  <div className="beat"><span className="k m">{c.beats.model}</span><p><Inline text={s.model} /></p></div>
                  <div className="beat"><span className="k s">{c.beats.mongo}</span><ul>{s.mongo.map((m) => <li key={m}><Inline text={m} /></li>)}</ul></div>
                  <div className="beat"><span className="k r">{c.beats.result}</span><p><Inline text={s.result} /></p></div>
                </div>
              </div>
              <div className="model">
                <span className="cap">{s.caption}</span>
                <Visual id={id} d={c.d} />
                {id === "ts" && <><span className="cap">{s.caption2}</span><Runs d={c.d} /></>}
                {id !== "ts" && s.caption2 && <span className="cap">{s.caption2}</span>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="part" aria-labelledby="why-p4">
        <Head no={4} id="why-p4" title={c.p4.title} note={c.p4.note} />
        <div className="bound">
          <div className="wcard">
            <h3><i className="sw-on" />{c.p4.does}</h3>
            <div className="rows">
              {c.p4.doesRows.map(([what, how, who]) => (
                <div key={what} className="row"><b>{what}</b><span>{who && <em>{who}</em>} {how}</span></div>
              ))}
            </div>
          </div>
          <div className="wcard">
            <h3><i className="sw-off" />{c.p4.doesNot} <small>· {c.p4.who}</small></h3>
            <div className="rows">
              {c.p4.notRows.map(([what, who, how]) => (
                <div key={what} className="row"><b>{what}</b><span><em>{who}</em> {how}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Head({ no, id, title, note }: { no: number; id: string; title: string; note: string }) {
  return (
    <div className="part-h">
      <span className="no">{no}</span>
      <h2 id={id}>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

function Points({ points }: { points: { title: string; body: string; here: string }[] }) {
  return (
    <div className="points">
      {points.map((p) => (
        <div key={p.title} className="point">
          <h4>{p.title}</h4>
          <p>{p.body}</p>
          <p className="here"><Inline text={p.here} /></p>
        </div>
      ))}
    </div>
  );
}
