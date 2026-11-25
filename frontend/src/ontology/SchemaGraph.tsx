// The high-level graph: one node per type, sized by how many it has, and
// its relations. Solid edges are ontology link types; dashed ones are field
// references the engine follows.

import * as d3 from "d3";
import { useEffect, useRef } from "react";

import type { SchemaEdge, SchemaGraph as Schema, SchemaNode } from "../types";
import { TYPE_COLORS } from "./colors";

const H = 620;

/** Where each type starts, as a fraction of the stage; the simulation only untangles from here. */
const AT: Record<string, [number, number]> = {
  Reefer: [0.09, 0.2], Shipment: [0.3, 0.22], Contract: [0.56, 0.13], Clause: [0.58, 0.5], EventType: [0.32, 0.62],
  Reading: [0.1, 0.72], CargoClass: [0.84, 0.28], ActionType: [0.86, 0.68], Party: [0.62, 0.86], KnowledgeChunk: [0.87, 0.5],
};

type Node = SchemaNode & d3.SimulationNodeDatum & { tx: number; ty: number };
type Edge = { edge: SchemaEdge; index: number; a: Node; b: Node };

export const radius = (count: number) => 14 + Math.log10(count + 1) * 11;

export default function SchemaGraph({ schema, selected, onNode, onEdge }: {
  schema: Schema;
  selected: { node?: string; edge?: number };
  onNode: (id: string) => void;
  onEdge: (index: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const handlers = useRef({ onNode, onEdge });
  handlers.current = { onNode, onEdge };

  useEffect(() => {
    const element = ref.current!;
    const W = element.getBoundingClientRect().width || 900;
    const svg = d3.select(element).attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();

    const nodes: Node[] = schema.nodes.map((n) => {
      const [fx, fy] = AT[n.id] ?? [0.5, 0.5];
      return { ...n, x: fx * W, y: fy * H, tx: fx * W, ty: fy * H };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges: Edge[] = schema.edges
      .map((edge, index) => ({ edge, index, a: byId.get(edge.from)!, b: byId.get(edge.to)! }))
      .filter((e) => e.a && e.b);

    const sim = d3
      .forceSimulation(nodes)
      .force("x", d3.forceX<Node>((d) => d.tx).strength(0.5))
      .force("y", d3.forceY<Node>((d) => d.ty).strength(0.5))
      .force("collide", d3.forceCollide<Node>((d) => radius(d.count) + 26));

    svg.append("defs").html(
      '<marker id="schema-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5d8a9b"/></marker>',
    );
    const paths = svg.append("g").selectAll("path").data(edges).join("path")
      .attr("class", "sl").attr("marker-end", "url(#schema-arrow)")
      .attr("stroke-dasharray", (d) => (d.edge.linkType ? null : "5 4"))
      .on("click", (_, d) => handlers.current.onEdge(d.index));
    const labels = svg.append("g").selectAll("text").data(edges).join("text")
      .attr("class", "sll").attr("text-anchor", "middle").text((d) => d.edge.name);
    const groups = svg.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g")
      .attr("class", "sn").attr("tabindex", 0).attr("role", "button").attr("aria-label", (d) => `${d.id} ${d.count}`)
      .on("click", (_, d) => handlers.current.onNode(d.id))
      .on("keydown", (e: KeyboardEvent, d) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlers.current.onNode(d.id);
        }
      })
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (e) => { if (!e.active) sim.alphaTarget(0.3).restart(); })
        .on("drag", (e, d) => { d.tx = e.x; d.ty = e.y; })
        .on("end", (e) => { if (!e.active) sim.alphaTarget(0); }));
    groups.append("circle").attr("class", "halo").attr("r", (d) => radius(d.count) + 7).attr("stroke", (d) => TYPE_COLORS[d.id] ?? "#8fb8c4");
    groups.append("circle").attr("class", "core").attr("r", (d) => radius(d.count)).attr("fill", (d) => TYPE_COLORS[d.id] ?? "#8fb8c4");
    groups.append("text").attr("y", (d) => radius(d.count) + 22).text((d) => d.id);
    groups.append("text").attr("class", "cnt").attr("y", (d) => radius(d.count) + 37).text((d) => d.count.toLocaleString());

    const geometry = ({ a, b }: Edge) => {
      const ra = radius(a.count), rb = radius(b.count);
      if (a === b) {
        const x = a.x!, y = a.y! - ra;
        return { d: `M${x - 10},${y + 2} C${x - 40},${y - 58} ${x + 40},${y - 58} ${x + 10},${y + 2}`, lx: x, ly: y - 46 };
      }
      const dx = b.x! - a.x!, dy = b.y! - a.y!, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const sx = a.x! + ux * (ra + 3), sy = a.y! + uy * (ra + 3), ex = b.x! - ux * (rb + 9), ey = b.y! - uy * (rb + 9);
      const mx = (sx + ex) / 2 - uy * 18, my = (sy + ey) / 2 + ux * 18;
      return { d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, lx: (sx + 2 * mx + ex) / 4, ly: (sy + 2 * my + ey) / 4 - 4 };
    };
    const draw = () => {
      for (const n of nodes) {
        const r = radius(n.count) + 10;
        n.x = Math.max(r, Math.min(W - r, n.x!));
        n.y = Math.max(r + 50, Math.min(H - r - 30, n.y!));
      }
      paths.attr("d", (d) => geometry(d).d);
      labels.attr("x", (d) => geometry(d).lx).attr("y", (d) => geometry(d).ly);
      groups.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    sim.on("tick", draw);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(200);
      draw();
    }
    return () => {
      sim.stop();
    };
  }, [schema]);

  useEffect(() => {
    d3.select(ref.current).selectAll<SVGGElement, Node>(".sn").classed("sel", (d) => d.id === selected.node);
    d3.select(ref.current).selectAll<SVGPathElement, Edge>(".sl").classed("sel", (d) => d.index === selected.edge);
  }, [selected, schema]);

  return <svg ref={ref} className="schema" role="img" aria-label="Ontology schema" />;
}
