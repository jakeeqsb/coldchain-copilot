// Hand-written SVG charts for the measurement series. Every mark is placed
// with the same time and value scales; colors come from the CSS tokens.

import { useId } from "react";

import type { Series } from "../types";

const HOUR = 3_600_000;
const KST_OFFSET = 9 * HOUR; // Korea has no daylight saving time.

type Scale = (value: number) => number;

function linear([d0, d1]: [number, number], [r0, r1]: [number, number]): Scale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * k;
}

/** Tick times on whole KST hours, every `step` hours, inside [start, end]. */
function hourTicks(start: number, end: number, step: number): number[] {
  const first = Math.ceil((start + KST_OFFSET) / (step * HOUR)) * step * HOUR - KST_OFFSET;
  const ticks = [];
  for (let at = first; at <= end; at += step * HOUR) ticks.push(at);
  return ticks;
}

/** "05:44" in KST. */
export function kstTime(ms: number): string {
  const d = new Date(ms + KST_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function tempDomain(series: Series, pad: number): [number, number] {
  const temps = series.buckets.flatMap((b) => [b.minTemp, b.maxTemp]);
  const low = Math.min(series.band.minC, ...temps);
  const high = Math.max(series.band.maxC, ...temps);
  const margin = Math.max((high - low) * pad, 0.5);
  return [low - margin, high + margin];
}

function path(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

/** The temperature line, drawn again in the alert color where it leaves the band. */
function TempLine({ d, outside, clipId }: { d: string; outside: [number, number][]; clipId: string }) {
  return (
    <>
      <clipPath id={clipId}>
        {outside.map(([y, h], i) => (
          <rect key={i} x="0" y={y} width="10000" height={Math.max(h, 0)} />
        ))}
      </clipPath>
      <path className="temp" d={d} />
      <path className="temp-hot" d={d} clipPath={`url(#${clipId})`} />
    </>
  );
}

export type ChartLabels = { temp: string; power: string; door: string; band: string; peak: string };

/**
 * One shipment's dashboard chart: temperature with its allowed band and
 * excursion spans, average power, and door openings, on one time axis.
 */
export function ShipmentChart({ series, labels, width = 820, compact = false }: {
  series: Series;
  labels: ChartLabels;
  width?: number;
  /** A lower chart for the chat column: the same marks with shorter panels. */
  compact?: boolean;
}) {
  const clipId = useId().replace(/:/g, "");
  const W = width, L = 46, R = 12;
  const T = compact ? { top: 14, bottom: 130 } : { top: 14, bottom: 214 };
  const P = compact ? { top: 150, bottom: 180 } : { top: 236, bottom: 296 };
  const D = compact ? { top: 192, bottom: 202 } : { top: 314, bottom: 328 };
  const H = compact ? 226 : 352;

  const start = Date.parse(series.window.start), end = Date.parse(series.window.end);
  const x = linear([start, end], [L, W - R]);
  const yT = linear(tempDomain(series, 0.12), [T.bottom, T.top]);
  const powers = series.buckets.map((b) => b.avgPowerKw ?? 0);
  const yP = linear([0, Math.max(...powers, 1) * 1.15], [P.bottom, P.top]);
  const bucketWidth = x(start + series.bucketMinutes * 60_000) - x(start);

  const times = series.buckets.map((b) => Date.parse(b.ts) + (series.bucketMinutes * 60_000) / 2);
  const tempPath = path(series.buckets.map((b, i) => [x(times[i]), yT(b.avgTemp)]));
  const powerPath = path(series.buckets.map((b, i) => [x(times[i]), yP(b.avgPowerKw ?? 0)]));
  const { minC, maxC } = series.band;
  const outside: [number, number][] = [[0, yT(maxC)], [yT(minC), H]];

  const tempTicks = linearTicks(tempDomain(series, 0.12), 5);
  const timeTicks = hourTicks(start, end, 4);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels.temp}, ${labels.power}, ${labels.door}`}>
      {/* temperature panel */}
      <rect className="band" x={L} y={yT(maxC)} width={W - R - L} height={yT(minC) - yT(maxC)} />
      {series.buckets.map((b, i) =>
        b.doorOpen ? <rect key={i} className="shade" x={x(Date.parse(b.ts))} y={T.top} width={bucketWidth} height={T.bottom - T.top} /> : null,
      )}
      {series.excursions.map((e, i) => (
        <rect key={i} className="over" x={x(Date.parse(e.start))} y={T.top}
              width={Math.max(x(Date.parse(e.end)) - x(Date.parse(e.start)), 2)} height={T.bottom - T.top} />
      ))}
      {tempTicks.map((v) => (
        <g key={v}>
          <line className="grid" x1={L} x2={W - R} y1={yT(v)} y2={yT(v)} />
          <text className="tick" x={L - 6} y={yT(v) + 3} textAnchor="end">{formatTemp(v)}</text>
        </g>
      ))}
      <line className="lim" x1={L} x2={W - R} y1={yT(maxC)} y2={yT(maxC)} />
      <line className="lim" x1={L} x2={W - R} y1={yT(minC)} y2={yT(minC)} />
      <text className="ann2" x={W - R - 4} y={yT(maxC) - 4} textAnchor="end">{labels.band} {range(minC, maxC)}</text>
      <TempLine d={tempPath} outside={outside} clipId={clipId} />
      {series.excursions.map((e, i) => {
        // The peak is drawn in the bucket inside the span that comes closest to it.
        const above = e.measures.direction === "above";
        const peak = above ? e.measures.peakTemp : e.measures.lowestTemp;
        const from = Date.parse(e.start) - series.bucketMinutes * 60_000, to = Date.parse(e.end);
        let at = Date.parse(e.start), gap = Infinity;
        series.buckets.forEach((b, j) => {
          const ts = Date.parse(b.ts);
          const distance = Math.abs((above ? b.maxTemp : b.minTemp) - peak);
          if (ts >= from && ts <= to && distance < gap) [at, gap] = [times[j], distance];
        });
        const px = x(at);
        const right = px > W - 230;
        return (
          <g key={i}>
            <circle className="peak" cx={px} cy={yT(peak)} r="3.5" />
            <text className="ann" x={px + (right ? -8 : 8)} y={yT(peak) + 4} textAnchor={right ? "end" : "start"}>
              {labels.peak} {peak.toFixed(1)} °C · {kstTime(Date.parse(e.start))}–{kstTime(Date.parse(e.end))}
            </text>
          </g>
        );
      })}
      <text className="tick" x={L} y={T.top - 4}>{labels.temp} °C</text>

      {/* power panel */}
      <line className="ax" x1={L} x2={W - R} y1={P.bottom} y2={P.bottom} />
      <path className="pow" d={powerPath} />
      <text className="tick" x={L} y={P.top - 6}>{labels.power} kW</text>
      <text className="tick" x={L - 6} y={yP(0) + 3} textAnchor="end">0</text>

      {/* door strip */}
      <rect className="track" x={L} y={D.top} width={W - R - L} height={D.bottom - D.top} />
      {series.buckets.map((b, i) =>
        b.doorOpen ? <rect key={i} className="door" x={x(Date.parse(b.ts))} y={D.top} width={Math.max(bucketWidth, 2)} height={D.bottom - D.top} /> : null,
      )}
      <text className="tick" x={L - 6} y={D.bottom - 3} textAnchor="end">{labels.door}</text>

      {/* time axis */}
      {timeTicks.map((at) => (
        <g key={at}>
          <line className="grid" x1={x(at)} x2={x(at)} y1={T.top} y2={D.bottom} />
          <text className="tick" x={x(at)} y={H - 6} textAnchor="middle">{kstTime(at)}</text>
        </g>
      ))}
    </svg>
  );
}

/** A small temperature chart for comparing the fleet: band, line, excursion spans. */
export function Sparkline({ series, label }: { series: Series; label: string }) {
  const clipId = useId().replace(/:/g, "");
  const W = 220, H = 64, pad = 4;
  const start = Date.parse(series.window.start), end = Date.parse(series.window.end);
  const x = linear([start, end], [pad, W - pad]);
  const y = linear(tempDomain(series, 0.08), [H - pad, pad]);
  const { minC, maxC } = series.band;
  const d = path(series.buckets.map((b) => [x(Date.parse(b.ts)), y(b.avgTemp)]));
  return (
    <svg className="chart spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect className="band" x={pad} y={y(maxC)} width={W - 2 * pad} height={y(minC) - y(maxC)} />
      {series.excursions.map((e, i) => (
        <rect key={i} className="over" x={x(Date.parse(e.start))} y={pad}
              width={Math.max(x(Date.parse(e.end)) - x(Date.parse(e.start)), 2)} height={H - 2 * pad} />
      ))}
      <TempLine d={d} outside={[[0, y(maxC)], [y(minC), H]]} clipId={clipId} />
    </svg>
  );
}

function linearTicks([low, high]: [number, number], count: number): number[] {
  const raw = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = Math.ceil(low / step) * step; v <= high; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** "0 – 4 °C", or "-60 ~ -50 °C" when a bound is negative, so the dash is not read as a minus. */
export function range(minC: number, maxC: number): string {
  return `${minC} ${minC < 0 || maxC < 0 ? "~" : "–"} ${maxC} °C`;
}

function formatTemp(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
