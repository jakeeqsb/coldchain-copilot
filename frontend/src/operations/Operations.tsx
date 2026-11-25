// Operations tab: the fleet strip, then the selected shipment's dashboard and the chat.

import { useEffect, useState } from "react";

import { api } from "../api";
import type { LastRun } from "../architecture/content";
import type { Language, Text } from "../i18n";
import type { ClauseResult, FleetRow, Obligations, Series, Shipment } from "../types";
import Chat from "./Chat";
import { range } from "./charts";
import { FleetCompare, ShipmentDashboard } from "./Dashboard";

const FLEET_ID = "FLEET-01";

export type ShipmentCard = { row: FleetRow; shipment: Shipment; obligations: Obligations };

export type Verdict = "triggered" | "unresolved" | "ok";

/** The shipment's state from its clause results: any triggered clause wins over an unresolved one. */
export function verdict(results: ClauseResult[]): { kind: Verdict; count: number } {
  const count = (status: string) => results.filter((r) => r.status === status).length;
  if (count("triggered")) return { kind: "triggered", count: count("triggered") };
  if (count("unresolved")) return { kind: "unresolved", count: count("unresolved") };
  return { kind: "ok", count: 0 };
}

export const CHIP: Record<Verdict, string> = { triggered: "t", unresolved: "u", ok: "ok" };

export default function Operations({ t, language, onRun }: { t: Text; language: Language; onRun: (run: LastRun) => void }) {
  const [cards, setCards] = useState<ShipmentCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, Series>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const fleet = await api.fleet(FLEET_ID);
      const loaded = await Promise.all(
        fleet.shipments.map(async (row) => {
          const [shipment, obligations] = await Promise.all([api.shipment(row.shipmentId), api.obligations(row.shipmentId)]);
          return { row, shipment, obligations };
        }),
      );
      loaded.sort((a, b) => a.row.shipmentId.localeCompare(b.row.shipmentId));
      if (!live) return;
      setCards(loaded);
      setSelected((current) => current ?? loaded[0]?.row.shipmentId ?? null);
      for (const { row } of loaded) {
        api.series(row.shipmentId).then((s) => live && setSeries((all) => ({ ...all, [row.shipmentId]: s })), () => {});
      }
    })().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const card = cards?.find((c) => c.row.shipmentId === selected);

  return (
    <div className="ops">
      <section className="panel">
        <div className="panel-h">
          <h2>
            {t.fleet} · {FLEET_ID}
          </h2>
          <span className="stats">{t.window}</span>
        </div>
        <div className="panel-b">
          {error ? (
            <p className="error">{t.loadFailed}</p>
          ) : !cards ? (
            <p className="empty">{t.loading}</p>
          ) : (
            <div className="fleetstrip" role="listbox" aria-label={t.fleet}>
              {cards.map((card) => (
                <FleetCard key={card.row.shipmentId} card={card} t={t} selected={selected === card.row.shipmentId}
                           onSelect={() => setSelected(card.row.shipmentId)} />
              ))}
            </div>
          )}
        </div>
      </section>
      <div className="ops-main">
      <div className="ops-left">
      {cards && (
        <section className="panel">
          <div className="panel-h">
            <h2>{t.compare}</h2>
            <span className="stats">{t.window}</span>
          </div>
          <div className="panel-b">
            <FleetCompare cards={cards} series={series} selected={selected} onSelect={setSelected} t={t} />
          </div>
        </section>
      )}
      {card && (
        <section className="panel">
          <div className="panel-h">
            <h2>
              {t.dash.title} · {card.row.reeferId} · {card.row.shipmentId}
            </h2>
            <span className="stats">{t.window} · KST</span>
          </div>
          <div className="panel-b">
            <ShipmentDashboard card={card} series={series[card.row.shipmentId]} t={t} />
          </div>
        </section>
      )}
      </div>
      <Chat t={t} language={language} series={series} onRun={onRun}
            shipmentOfReefer={Object.fromEntries((cards ?? []).map((c) => [c.row.reeferId, c.row.shipmentId]))} />
      </div>
    </div>
  );
}

function FleetCard({ card, t, selected, onSelect }: { card: ShipmentCard; t: Text; selected: boolean; onSelect: () => void }) {
  const { row, shipment, obligations } = card;
  const { minC, maxC } = shipment.temperaturePolicy;
  const v = verdict(obligations.results);
  const outside = row.lastTemp < minC || row.lastTemp > maxC;
  return (
    <button type="button" role="option" aria-selected={selected} className={`fs ${CHIP[v.kind]}`} onClick={onSelect}>
      <span className="fs-head">
        <b>{row.reeferId}</b>
        <span className="fs-id">{row.shipmentId}</span>
      </span>
      <span className="fs-cargo">{t.cargo[shipment.cargoType] ?? shipment.cargoType}</span>
      <span className="fs-temp">
        <span className={outside ? "hot" : undefined}>
          {t.last} {row.lastTemp.toFixed(1)} °C
        </span>
        <span className="fs-range">
          {t.range} {range(minC, maxC)}
        </span>
      </span>
      <span className="fs-foot">
        <span className={`chip ${CHIP[v.kind]}`}>
          {t.status[v.kind]}
          {v.count ? ` ${v.count}` : ""}
        </span>
        <span className="fs-range">
          {t.excursions} {row.excursionCount}
        </span>
      </span>
    </button>
  );
}
