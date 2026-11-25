// The fleet temperature comparison and the selected shipment's measurement dashboard.

import type { Text } from "../i18n";
import type { Series } from "../types";
import { kstTime, range, ShipmentChart, Sparkline } from "./charts";
import type { ShipmentCard } from "./Operations";

/** Five small temperature charts side by side; clicking one selects the shipment. */
export function FleetCompare({ cards, series, selected, onSelect, t }: {
  cards: ShipmentCard[];
  series: Record<string, Series>;
  selected: string | null;
  onSelect: (shipmentId: string) => void;
  t: Text;
}) {
  return (
    <div className="compare">
      {cards.map(({ row, shipment }) => {
        const s = series[row.shipmentId];
        return (
          <button key={row.shipmentId} type="button" className="cmp" aria-pressed={selected === row.shipmentId}
                  onClick={() => onSelect(row.shipmentId)}>
            <span className="cmp-head">
              <b>{row.reeferId}</b>
              <span>{t.cargo[shipment.cargoType] ?? shipment.cargoType}</span>
            </span>
            {s ? <Sparkline series={s} label={`${row.reeferId} ${t.dash.temp}`} /> : <span className="empty">{t.loading}</span>}
            <span className="cmp-foot">
              <span>{range(shipment.temperaturePolicy.minC, shipment.temperaturePolicy.maxC)}</span>
              <span className={row.excursionCount ? "hot" : undefined}>{t.excursions} {row.excursionCount}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One shipment: key figures, the combined chart, and each excursion with its cause. */
export function ShipmentDashboard({ card, series, t }: { card: ShipmentCard; series: Series | undefined; t: Text }) {
  const { row, shipment } = card;
  const figures: [string, string][] = [
    [t.dash.last, `${row.lastTemp.toFixed(1)} °C`],
    [t.dash.minMax, `${row.minTemp.toFixed(1)} / ${row.maxTemp.toFixed(1)} °C`],
    [t.dash.avgPower, `${row.avgPowerKw.toFixed(2)} kW`],
    [t.dash.doorMinutes, `${row.doorOpenMinutes} ${t.dash.min}`],
    [t.excursions, String(row.excursionCount)],
  ];
  return (
    <div className="dash">
      <p className="dash-route">
        {t.cargo[shipment.cargoType] ?? shipment.cargoType} · {shipment.route.origin} → {shipment.route.destination}
      </p>
      <dl className="figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {series ? (
        <>
          <ShipmentChart series={series} labels={t.dash} />
          <div className="legend">
            <span><i className="lg-temp" />{t.dash.temp}</span>
            <span><i className="lg-hot" />{t.dash.outside}</span>
            <span><i className="lg-band" />{t.dash.band}</span>
            <span><i className="lg-pow" />{t.dash.power}</span>
            <span><i className="lg-door" />{t.dash.door}</span>
          </div>
          {series.excursions.length > 0 && (
            <ul className="events">
              {series.excursions.map((e) => (
                <li key={e.start}>
                  <span className="chip t">{t.dash.excursion}</span>
                  <span className="mono">{kstTime(Date.parse(e.start))}–{kstTime(Date.parse(e.end))} KST</span>
                  <span>{e.measures.consecutiveMinutes} {t.dash.min}</span>
                  <span>
                    {t.dash.peak} {(e.measures.direction === "above" ? e.measures.peakTemp : e.measures.lowestTemp).toFixed(1)} °C
                  </span>
                  {e.measures.cause && <span>{t.dash.cause}: {t.causes[e.measures.cause] ?? e.measures.cause}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="empty">{t.loading}</p>
      )}
    </div>
  );
}
