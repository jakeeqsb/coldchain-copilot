// Ontology tab: the schema graph, a drill-down to the entity graph with
// filters, and an inspector for whatever is selected.

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { Text } from "../i18n";
import type { EntityGraph as Graph, EntityNode, SchemaGraph as Schema, Status } from "../types";
import { STATUS_COLORS, TYPE_COLORS } from "./colors";
import EntityGraph from "./EntityGraph";
import SchemaGraph from "./SchemaGraph";

type Level = "schema" | "entities";
type Selection = { node?: string; edge?: number; entity?: string };
/** Clause id → status, per shipment, from the engine. */
type Statuses = Record<string, Record<string, Status>>;

const STATUS_CHIP: Record<string, string> = { triggered: "t", unresolved: "u", not_triggered: "n" };

/** Short labels: "blueharbor-live-fish-v1-art6" → "blueharbor art6", "oceanpeak-tuna@v1" → "oceanpeak v1". */
function shortLabel(node: EntityNode): string {
  if (node.type === "Clause") {
    const parts = node.id.split("-");
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  if (node.type === "Contract") {
    const [id, version] = node.id.split("@");
    return `${id.split("-")[0]} ${version}`;
  }
  return node.label;
}

export default function Ontology({ t }: { t: Text }) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [statuses, setStatuses] = useState<Statuses>({});
  const [error, setError] = useState(false);
  const [level, setLevel] = useState<Level>("schema");
  const [selection, setSelection] = useState<Selection>({ node: "Clause" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [shipment, setShipment] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([api.schema(), api.entities()])
      .then(async ([s, g]) => {
        if (!live) return;
        setSchema(s);
        setGraph({ ...g, nodes: g.nodes.map((n) => ({ ...n, label: shortLabel(n) })) });
        const shipments = g.nodes.filter((n) => n.type === "Shipment").map((n) => n.id);
        const results = await Promise.all(shipments.map((id) => api.obligations(id)));
        if (!live) return;
        setStatuses(Object.fromEntries(results.map((o) => [o.shipmentId, Object.fromEntries(o.results.map((r) => [r.clauseId, r.status]))])));
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  const entityTypes = useMemo(() => [...new Set(graph?.nodes.map((n) => n.type) ?? [])], [graph]);
  const shipments = useMemo(() => graph?.nodes.filter((n) => n.type === "Shipment") ?? [], [graph]);

  /**
   * With a shipment chosen, the entities around it: its reefer, contract, and
   * cargo class with the class's ancestors; the clauses that apply to it; and
   * what those clauses link to. A clause that does not apply is left out
   * even when an applicable one references it.
   */
  const scope = useMemo(() => {
    if (!graph || !shipment) return null;
    const applicable = new Set(Object.keys(statuses[shipment] ?? {}));
    const type = new Map(graph.nodes.map((n) => [n.id, n.type]));
    const ids = new Set([shipment, ...applicable]);
    for (const e of graph.edges) {
      for (const [from, to] of [[e.from, e.to], [e.to, e.from]]) {
        if ((from === shipment || applicable.has(from)) && (type.get(to) !== "Clause" || applicable.has(to))) ids.add(to);
      }
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of graph.edges) {
        if (e.name === "parent" && ids.has(e.from) && !ids.has(e.to)) {
          ids.add(e.to);
          grew = true;
        }
      }
    }
    for (const id of [...ids]) {
      if (type.get(id) === "Shipment" && id !== shipment) ids.delete(id);
    }
    return ids;
  }, [graph, shipment, statuses]);

  const visible = useCallback(
    (n: EntityNode) => {
      if (hidden.has(n.type)) return false;
      if (scope && !scope.has(n.id)) return false;
      if (n.type !== "Clause") return true;
      if (shipment) {
        const st = statuses[shipment]?.[n.id];
        return !!st && (!status || st === status);
      }
      return !status || Object.values(statuses).some((byClause) => byClause[n.id] === status);
    },
    [hidden, scope, shipment, status, statuses],
  );

  const rings = useMemo(() => {
    const out: Record<string, string> = {};
    if (!shipment) return out;
    out[shipment] = TYPE_COLORS.Shipment;
    for (const [clauseId, st] of Object.entries(statuses[shipment] ?? {})) out[clauseId] = STATUS_COLORS[st];
    return out;
  }, [shipment, statuses]);

  function resetFilters() {
    setHidden(new Set());
    setShipment("");
    setStatus("");
    setQuery("");
  }

  /** Shows the entity graph with the type and its neighbors in the schema; other types are hidden. */
  function drill(type: string) {
    if (!schema || !graph) return;
    const near = new Set([type]);
    for (const e of schema.edges) {
      if (e.from === type) near.add(e.to);
      if (e.to === type) near.add(e.from);
    }
    resetFilters();
    setHidden(new Set(entityTypes.filter((k) => !near.has(k))));
    const first = graph.nodes.find((n) => n.type === type);
    setSelection(first ? { entity: first.id } : {});
    setLevel("entities");
  }

  function selectEntity(id: string) {
    const node = graph?.nodes.find((n) => n.id === id);
    if (node?.type === "Shipment") setShipment(id);
    setSelection({ entity: id });
  }

  if (error) return <p className="error">{t.loadFailed}</p>;
  if (!schema || !graph) return <p className="empty">{t.loading}</p>;

  const shownCount = graph.nodes.filter(visible).length;
  const note =
    level === "schema"
      ? `${t.o.types} ${schema.nodes.length} · ${t.o.relations} ${schema.edges.length} · ${t.o.sizeIsCount}`
      : `${t.o.entities} ${shownCount} / ${graph.nodes.length}` + (shipment ? ` · ${t.o.onlyFor(shipment)}` : "");

  return (
    <div className="work">
      <div className="stage">
        <div className="stage-bar">
          <div className="seg" role="tablist" aria-label={t.o.view}>
            <button type="button" role="tab" aria-selected={level === "schema"} onClick={() => setLevel("schema")}>
              {t.o.schema}
            </button>
            <button type="button" role="tab" aria-selected={level === "entities"} onClick={() => setLevel("entities")}>
              {t.o.entityView}
            </button>
          </div>
          <span>{note}</span>
        </div>
        {level === "entities" && (
          <div className="filters">
            <span className="kinds">
              {entityTypes.map((type) => (
                <button key={type} type="button" className={`pill${hidden.has(type) ? " off" : ""}`} aria-pressed={!hidden.has(type)}
                        onClick={() => setHidden((all) => {
                          const next = new Set(all);
                          if (next.has(type)) next.delete(type);
                          else next.add(type);
                          return next;
                        })}>
                  <i style={{ background: TYPE_COLORS[type] }} />
                  {t.o.typeNames[type] ?? type}
                </button>
              ))}
            </span>
            <label>
              {t.o.shipment}{" "}
              <select id="onto-shipment" value={shipment} onChange={(e) => setShipment(e.target.value)}>
                <option value="">{t.o.all}</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>{s.id}</option>
                ))}
              </select>
            </label>
            <label>
              {t.o.verdict}{" "}
              <select id="onto-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t.o.all}</option>
                {(["triggered", "unresolved", "not_triggered"] as const).map((s) => (
                  <option key={s} value={s}>{t.w.status[s]}</option>
                ))}
              </select>
            </label>
            <label>
              {t.o.search}{" "}
              <input id="onto-search" type="search" value={query} placeholder="art6, RF-02, notify" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button type="button" className="pill" onClick={resetFilters}>{t.o.reset}</button>
          </div>
        )}
        {level === "schema" ? (
          <SchemaGraph schema={schema} selected={selection} onNode={(id) => setSelection({ node: id })}
                       onEdge={(index) => setSelection({ edge: index })} />
        ) : (
          <EntityGraph graph={graph} visible={visible} query={query} rings={rings} onSelect={selectEntity} />
        )}
      </div>
      <aside className="panel inspector" aria-live="polite">
        <Inspector t={t} schema={schema} graph={graph} statuses={statuses} selection={selection} level={level} onDrill={drill} />
      </aside>
    </div>
  );
}

function Inspector({ t, schema, graph, statuses, selection, level, onDrill }: {
  t: Text;
  schema: Schema;
  graph: Graph;
  statuses: Statuses;
  selection: Selection;
  level: Level;
  onDrill: (type: string) => void;
}) {
  if (level === "schema" && selection.node) {
    const node = schema.nodes.find((n) => n.id === selection.node)!;
    const outgoing = schema.edges.filter((e) => e.from === node.id);
    const incoming = schema.edges.filter((e) => e.to === node.id && e.from !== node.id);
    const drillable = graph.nodes.some((n) => n.type === node.id);
    return (
      <>
        <div className="panel-h"><h2>{t.o.type}</h2></div>
        <div className="panel-b">
          <h3>{node.id}</h3>
          <p className="role">{t.o.roles[node.id] ?? ""}</p>
          <div className="rel">
            <span>{node.count.toLocaleString()}</span>
            <span>{node.kind}</span>
          </div>
          <h4>{t.o.definition}</h4>
          <pre>{JSON.stringify(node.definition, null, 2)}</pre>
          <h4>{t.o.relations}</h4>
          <table className="reltab">
            <tbody>
              {outgoing.map((e, i) => (
                <tr key={`o${i}`}><td>→</td><td><code>{e.name}</code></td><td>{e.to}</td></tr>
              ))}
              {incoming.map((e, i) => (
                <tr key={`i${i}`}><td>←</td><td><code>{e.name}</code></td><td>{e.from}</td></tr>
              ))}
            </tbody>
          </table>
          {drillable ? (
            <button type="button" className="drill" onClick={() => onDrill(node.id)}>{t.o.drill(node.id)}</button>
          ) : (
            <p className="demo">{node.id === "Reading" ? t.o.readingNote : t.o.knowledgeNote}</p>
          )}
        </div>
      </>
    );
  }

  if (level === "schema" && selection.edge !== undefined) {
    const edge = schema.edges[selection.edge];
    return (
      <>
        <div className="panel-h"><h2>{t.o.relation}</h2></div>
        <div className="panel-b">
          <h3>{edge.name}</h3>
          <p className="role">{edge.from} → {edge.to}</p>
          <div className="rel"><span>{edge.linkType ? "ontology linkType" : t.o.fieldRef}</span></div>
          <h4>{edge.linkType ? "linkType" : t.o.storedIn}</h4>
          <pre>{edge.linkType ?? edge.field}</pre>
          {edge.name === "references" && <p className="demo">{t.o.referencesNote}</p>}
        </div>
      </>
    );
  }

  const node = graph.nodes.find((n) => n.id === selection.entity);
  if (!node) return <div className="panel-b empty">{t.o.pick}</div>;

  const relations: [string, string, EntityNode][] = [];
  for (const e of graph.edges) {
    if (e.from === node.id) relations.push(["→", e.name, graph.nodes.find((n) => n.id === e.to)!]);
    if (e.to === node.id) relations.push(["←", e.name, graph.nodes.find((n) => n.id === e.from)!]);
  }
  return (
    <>
      <div className="panel-h"><h2>{t.o.entity}</h2></div>
      <div className="panel-b">
        <h3>{node.label}</h3>
        <p className="role">{t.o.typeNames[node.type] ?? node.type} · <code>{node.id}</code></p>
        <EntityBody t={t} node={node} statuses={statuses} graph={graph} />
        <h4>{t.o.relations} {relations.length}</h4>
        <table className="reltab">
          <tbody>
            {relations.map(([dir, name, other], i) => (
              <tr key={i}>
                <td>{dir}</td>
                <td><code>{name}</code></td>
                <td>{other.label} <span className="role">· {t.o.typeNames[other.type] ?? other.type}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EntityBody({ t, node, statuses, graph }: { t: Text; node: EntityNode; statuses: Statuses; graph: Graph }) {
  if (node.type === "Shipment") {
    const byClause = statuses[node.id] ?? {};
    const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
    return (
      <>
        <p className="demo">{t.o.shipmentNote}</p>
        <h4>{t.o.applicable}</h4>
        <table className="reltab">
          <tbody>
            {Object.entries(byClause).map(([clauseId, st]) => (
              <tr key={clauseId}>
                <td />
                <td>{label(clauseId)}</td>
                <td><span className={`chip ${STATUS_CHIP[st]}`}>{t.w.status[st]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  if (node.type === "Clause") {
    return (
      <>
        <h4>trigger</h4>
        <pre>{JSON.stringify(node.data.trigger, null, 2)}</pre>
        <h4>action</h4>
        <pre>{JSON.stringify(node.data.action, null, 2)}</pre>
        <h4>{t.o.perShipment}</h4>
        <div className="rel">
          {Object.entries(statuses).map(([shipmentId, byClause]) =>
            byClause[node.id] ? (
              <span key={shipmentId} className={`chip ${STATUS_CHIP[byClause[node.id]]}`}>
                {shipmentId} {t.w.status[byClause[node.id]]}
              </span>
            ) : null,
          )}
        </div>
      </>
    );
  }
  const data = Object.fromEntries(Object.entries(node.data).filter(([key]) => key !== "_id"));
  return (
    <>
      <h4>{t.o.definition}</h4>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </>
  );
}
