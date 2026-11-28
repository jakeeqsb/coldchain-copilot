// The Home emblem: each ontology type drawn as a small leaf, joined by the
// relations the engine follows. Light pulses travel along the relations.

type Leaf = { id: string; x: number; y: number; size: number; tilt: number; above?: boolean };

const LEAVES: Leaf[] = [
  { id: "Shipment", x: 96, y: 72, size: 1.25, tilt: -12 },
  { id: "Contract", x: 258, y: 58, size: 1, tilt: 14 },
  { id: "Clause", x: 214, y: 168, size: 1.45, tilt: 6, above: true },
  { id: "Reading", x: 42, y: 196, size: 1.1, tilt: -20 },
  { id: "EventType", x: 118, y: 258, size: 1, tilt: 10 },
  { id: "CargoClass", x: 312, y: 236, size: 0.9, tilt: 22 },
  { id: "Knowledge", x: 226, y: 290, size: 1, tilt: -8 },
];

/** Relations between the leaves: [from, to, name]. Names follow the ontology's link types and field references. */
const LINKS: [string, string, string][] = [
  ["Shipment", "Contract", "governedBy"],
  ["Contract", "Clause", "hasClause"],
  ["Shipment", "Reading", "measuredBy"],
  ["Clause", "EventType", "triggeredBy"],
  ["EventType", "Reading", "on"],
  ["Clause", "CargoClass", "appliesTo"],
  ["Clause", "Knowledge", "$lookup"],
];

const at = (id: string) => LEAVES.find((l) => l.id === id)!;

/** A leaf pointing up, 28 units tall before scaling, with its center vein and a short stem. */
const LEAF = "M0,-15 C10,-7 10,6 0,15 C-10,6 -10,-7 0,-15 Z";

export default function Emblem() {
  return (
    <svg className="emblem" viewBox="0 0 350 330" role="img" aria-label="Ontology types drawn as leaves, joined by their relations">
      <defs>
        <radialGradient id="emblem-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,237,100,.14)" />
          <stop offset="100%" stopColor="rgba(0,237,100,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="178" cy="172" rx="175" ry="160" fill="url(#emblem-halo)" />

      {LINKS.map(([from, to, name], i) => {
        const a = at(from), b = at(to);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const d = `M${a.x},${a.y} Q${mx + (b.y - a.y) * 0.12},${my - (b.x - a.x) * 0.12} ${b.x},${b.y}`;
        return (
          <g key={name}>
            <path id={`link-${i}`} className="link" d={d} />
            <text className="rel" x={mx + (b.y - a.y) * 0.06} y={my - (b.x - a.x) * 0.06 - 4} textAnchor="middle">{name}</text>
            <circle className="pulse" r="2.4">
              <animateMotion dur={`${3 + (i % 3) * 0.8}s`} begin={`${i * 0.55}s`} repeatCount="indefinite">
                <mpath href={`#link-${i}`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}

      {LEAVES.map((l) => (
        <g key={l.id} className="leaf" transform={`translate(${l.x},${l.y})`}>
          <g transform={`rotate(${l.tilt}) scale(${l.size})`}>
            <path className="blade" d={LEAF} />
            <path className="vein" d="M0,-11 L0,12" />
            <path className="stem" d="M0,15 L-1,21" />
          </g>
          <text className="name" y={l.above ? -22 * l.size - 6 : 26 * l.size + 10} textAnchor="middle">{l.id}</text>
        </g>
      ))}
    </svg>
  );
}
