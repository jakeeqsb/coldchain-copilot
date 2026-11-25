// Chat: questions to the agent, with the answer shown while it is written
// and the tools it calls listed as they run.

import { type FormEvent, useEffect, useRef, useState } from "react";

import { ask } from "../api";
import type { Language, Text } from "../i18n";
import type { Series, Stats, TraceStep } from "../types";
import { chooseWidgets } from "./answerCharts";
import { Widgets } from "./Widgets";

type ToolRun = { id: string; name: string; arguments: Record<string, unknown>; seconds?: number; result?: any; trace?: TraceStep[] };

type Turn = {
  id: number;
  question: string;
  answer: string;
  tools: ToolRun[];
  state: "running" | "done" | "error";
  stats?: Stats;
  error?: string;
};

function newThreadId(): string {
  return `web-${crypto.randomUUID().slice(0, 8)}`;
}

export default function Chat({ t, language, series, shipmentOfReefer }: {
  t: Text;
  language: Language;
  series: Record<string, Series>;
  shipmentOfReefer: Record<string, string>;
}) {
  const [threadId, setThreadId] = useState(newThreadId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const running = turns.some((turn) => turn.state === "running");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns]);

  async function send(question: string) {
    if (!question.trim() || running) return;
    const id = Date.now();
    const update = (change: (turn: Turn) => Turn) =>
      setTurns((all) => all.map((turn) => (turn.id === id ? change(turn) : turn)));
    setTurns((all) => [...all, { id, question, answer: "", tools: [], state: "running" }]);
    setDraft("");
    try {
      await ask(question, threadId, language, (e) => {
        if (e.event === "token") update((turn) => ({ ...turn, answer: turn.answer + e.data.text }));
        else if (e.event === "tool_call") update((turn) => ({ ...turn, tools: [...turn.tools, e.data] }));
        else if (e.event === "tool_result")
          update((turn) => ({
            ...turn,
            tools: turn.tools.map((tool) =>
              tool.id === e.data.id ? { ...tool, seconds: e.data.seconds, result: e.data.result, trace: e.data.trace } : tool,
            ),
          }));
        else if (e.event === "done") update((turn) => ({ ...turn, answer: e.data.answer, stats: e.data.stats, state: "done" }));
        else if (e.event === "error") update((turn) => ({ ...turn, error: e.data.message, state: "error" }));
      });
      update((turn) => (turn.state === "running" ? { ...turn, state: "error", error: t.chat.cutOff } : turn));
    } catch (error) {
      update((turn) => ({ ...turn, state: "error", error: (error as Error).message }));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  function reset() {
    setTurns([]);
    setThreadId(newThreadId());
  }

  return (
    <section className="panel chat">
      <div className="panel-h">
        <h2>{t.chat.title}</h2>
        <button type="button" className="link" onClick={reset} disabled={running || !turns.length}>
          {t.chat.reset}
        </button>
      </div>
      <div className="msgs" ref={scroller}>
        {turns.length === 0 && <p className="empty">{t.chat.empty}</p>}
        {turns.map((turn) => (
          <div key={turn.id} className="turn">
            <p className="q">{turn.question}</p>
            <div className="answer">
              {turn.tools.length > 0 && (
                <ul className="tool-runs">
                  {turn.tools.map((tool) => (
                    <li key={tool.id} className={tool.seconds === undefined ? "busy" : undefined}>
                      <span className="mono">{tool.name}</span>
                      <span className="mono args">{argumentsText(tool.arguments)}</span>
                      <span className="mono">{tool.seconds === undefined ? "…" : `${tool.seconds.toFixed(2)} s`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {turn.answer ? (
                <div className="txt">
                  <Rich text={turn.answer} />
                  {turn.state === "running" && <span className="caret" aria-hidden="true" />}
                </div>
              ) : (
                turn.state === "running" && <p className="empty">{turn.tools.length ? t.chat.reading : t.chat.thinking}</p>
              )}
              <Widgets widgets={chooseWidgets(turn.tools.filter((tool) => tool.result !== undefined) as any, shipmentOfReefer)}
                       series={series} t={t} />
              {turn.error && <p className="error">{turn.error}</p>}
              {turn.stats && (
                <p className="stats">
                  {turn.stats.seconds} s · {t.chat.firstText} {turn.stats.first_text_seconds ?? "–"} s · LLM {turn.stats.llm_calls} ·{" "}
                  {turn.stats.input_tokens.toLocaleString()} / {turn.stats.output_tokens.toLocaleString()} tokens
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="asks">
        {t.chat.suggestions.map((question) => (
          <button key={question} type="button" className="ask" disabled={running} onClick={() => send(question)}>
            {question}
          </button>
        ))}
      </div>
      <form className="compose" onSubmit={submit}>
        <input id="question" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.chat.placeholder}
               aria-label={t.chat.placeholder} autoComplete="off" />
        <button type="submit" disabled={running || !draft.trim()}>
          {t.chat.send}
        </button>
      </form>
    </section>
  );
}

function argumentsText(args: Record<string, unknown>): string {
  return Object.values(args)
    .filter((value) => value !== "" && value !== null && value !== undefined)
    .map((value) => (typeof value === "object" ? JSON.stringify(value) : String(value)))
    .join(", ");
}

/** The answer text with **bold** spans; line breaks are kept by CSS. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  );
}
