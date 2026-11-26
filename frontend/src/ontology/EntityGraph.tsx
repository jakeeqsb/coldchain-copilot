// The detail graph: every seeded entity and its relations. Hovering a node
// lights its neighbors; filters hide nodes without rebuilding the layout.

import * as d3 from "d3";
import { useEffect, useRef } from "react";

import type { EntityGraph as Graph, EntityNode } from "../types";
import { TYPE_COLORS } from "./colors";

const H = 620;

/** Each type is pulled toward a column and row, so the layout reads left to right. */
const COLUMN: Record<string, number> = {
  Reefer: 0.08, Shipment: 0.24, Contract: 0.42, CargoClass: 0.36, Clause: 0.6, EventType: 0.84, ActionType: 0.84, Party: 0.62,
};
const ROW: Record<string, number> = {
  Reefer: 0.45, Shipment: 0.45, Contract: 0.25, CargoClass: 0.8, Clause: 0.45, EventType: 0.3, ActionType: 0.72, Party: 0.88,
};
const SIZE: Record<string, number> = { Shipment: 10, Contract: 10, EventType: 9, Clause: 7, CargoClass: 7, Reefer: 7, ActionType: 5, Party: 5 };

type Node = EntityNode & d3.SimulationNodeDatum;
type Link = d3.SimulationLinkDatum<Node> & { name: string };

export default function EntityGraph({ graph, visible, query, rings, onSelect }: {
  graph: Graph;
  visible: (node: EntityNode) => boolean;
  query: string;
  rings: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const element = ref.current!;
    const W = element.getBoundingClientRect().width || 900;
    const svg = d3.select(element).attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();

    const nodes: Node[] = graph.nodes.map((n) => ({ ...n }));
    const links: Link[] = graph.edges.map((e) => ({ source: e.from, target: e.to, name: e.name }));
    const size = (d: Node) => SIZE[d.type] ?? 6;

    const sim = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id((d) => d.id).distance((l) => (l.name === "parent" ? 40 : 70)).strength(0.35))
      .force("charge", d3.forceManyBody().strength(-170))
      .force("collide", d3.forceCollide(20))
      .force("x", d3.forceX<Node>((d) => (COLUMN[d.type] ?? 0.5) * W).strength(0.22))
      .force("y", d3.forceY<Node>((d) => (ROW[d.type] ?? 0.5) * H).strength(0.12));

    const lines = svg.append("g").selectAll("line").data(links).join("line").attr("class", "lk");
    const groups = svg.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g")
      .attr("class", "nd").attr("tabindex", 0).attr("role", "button").attr("aria-label", (d) => `${d.type} ${d.label}`);
    groups.append("circle").attr("class", "ring").attr("r", (d) => size(d) + 4).attr("stroke", "transparent");
    groups.append("circle").attr("class", "dot").attr("r", size).attr("fill", (d) => TYPE_COLORS[d.type] ?? "#89a39b");
    groups.append("text").attr("x", (d) => size(d) + 4).attr("y", 4).text((d) => d.label);

    const neighbors = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    for (const l of links) {
      const s = (l.source as Node).id, t = (l.target as Node).id;
      neighbors.get(s)!.add(t);
      neighbors.get(t)!.add(s);
    }
    const touches = (l: Link, id: string) => (l.source as Node).id === id || (l.target as Node).id === id;
    const focus = (d: Node | null) => {
      const near = d ? neighbors.get(d.id)! : null;
      groups.classed("dim", (n) => !!near && !near.has(n.id));
      lines.classed("hot", (l) => !!d && touches(l, d.id)).classed("dim", (l) => !!d && !touches(l, d.id));
    };
    groups
      .on("mouseenter", (_, d) => focus(d))
      .on("mouseleave", () => focus(null))
      .on("click", (_, d) => onSelectRef.current(d.id))
      .on("keydown", (e: KeyboardEvent, d) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectRef.current(d.id);
        }
      })
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    const draw = () => {
      for (const n of nodes) {
        n.x = Math.max(16, Math.min(W - 90, n.x!));
        n.y = Math.max(16, Math.min(H - 16, n.y!));
      }
      lines
        .attr("x1", (d) => (d.source as Node).x!).attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!).attr("y2", (d) => (d.target as Node).y!);
      groups.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    sim.on("tick", draw);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(300);
      draw();
    }
    return () => {
      sim.stop();
    };
  }, [graph]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    const q = query.trim().toLowerCase();
    const shown = (n: Node) => visible(n);
    svg.selectAll<SVGGElement, Node>(".nd")
      .style("display", (n) => (shown(n) ? null : "none"))
      .classed("hit", (n) => !!q && (n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)))
      .select(".ring").attr("stroke", (n) => rings[n.id] ?? "transparent");
    svg.selectAll<SVGLineElement, Link>(".lk")
      .style("display", (l) => (shown(l.source as Node) && shown(l.target as Node) ? null : "none"));
  }, [graph, visible, query, rings]);

  return <svg ref={ref} className="graph" role="img" aria-label="Ontology entity graph" />;
}
