"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import LiveFeed from "@/components/LiveFeed";
import { Card, NextStep, PageHeader, Pill, PriorityTag, Skeleton, TipBox } from "@/components/ui";
import { cx, hhmm } from "@/lib/format";
import { useStore } from "@/lib/store";

type Tab = "aircraft" | "crews" | "weapons" | "missions";

const th = "border-y border-line bg-panel-2 px-3 py-2.5 text-left text-[13px] font-semibold text-dim first:pl-6 last:pr-6";
const td = "border-b border-line px-3 py-3 first:pl-6 last:pr-6";

function timeAgo(iso?: string | null) {
  if (!iso) return "-";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

export default function DataPage() {
  const world = useStore((s) => s.world);
  const live = useStore((s) => s.live);
  const [tab, setTab] = useState<Tab>("aircraft");

  const types = Object.fromEntries((world?.aircraft_types ?? []).map((t) => [t.id, t.name]));
  const mtypes = Object.fromEntries((world?.mission_types ?? []).map((t) => [t.id, t.name]));
  const counts: Record<Tab, number> = {
    aircraft: world?.aircraft.length ?? 0,
    crews: world?.crews.length ?? 0,
    weapons: world?.weapon_types.length ?? 0,
    missions: world?.missions.length ?? 0,
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Data and live feed" description="Everything Aeolus knows, merged from eight systems into one picture." />
      <TipBox id="data" lines={["Browse the aircraft, crews, weapons and missions Aeolus plans with.", "The live feed on the right shows updates as they arrive."]} />

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
        <Info size={20} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-[14px] leading-6 text-muted">
          <b className="text-text">This is synthetic data.</b> Every aircraft type, base, crew and number is made up for this demo.
          {world && (
            <span>
              {" "}
              It comes from {Object.keys(world.sources).length} simulated systems:{" "}
              {Object.values(world.sources)
                .map((s) => s.source)
                .join(", ")}
              .
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex gap-1 border-b border-line px-4 pt-3" role="tablist" aria-label="Data tables">
            {(["aircraft", "crews", "weapons", "missions"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  "relative px-4 pb-3 pt-1 text-[14.5px] font-medium capitalize",
                  tab === t ? "text-primary-dark" : "text-muted hover:text-text",
                )}
              >
                {t} <span className="num ml-1 text-[12.5px] text-dim">{counts[t]}</span>
                {tab === t && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {!world ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-[14px]">
                {tab === "aircraft" && (
                  <>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {["Aircraft", "Type", "Base", "Status", "Ready to fly", "Now", "Updated"].map((h) => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {world.aircraft.map((a) => {
                        const tel = live.telemetry[a.id] ?? a.telemetry;
                        const svc = world.serviceability[a.id];
                        const downNow = a.status !== "serviceable" || a.unavailable.some((w) => w.start <= world.now && world.now < w.end);
                        return (
                          <tr key={a.id} className="hover:bg-panel-2">
                            <td className={cx(td, "num font-semibold")}>{a.id}</td>
                            <td className={td}>{types[a.type_id]}</td>
                            <td className={td}>{a.base_id}</td>
                            <td className={td}>{downNow ? <Pill tone="bad">Down</Pill> : <Pill tone="info">Ready</Pill>}</td>
                            <td className={cx(td, "num", svc !== undefined && svc < 0.5 ? "font-medium text-coral" : svc !== undefined && svc < 0.75 ? "text-amber" : "")}>
                              {svc === undefined ? "-" : `${Math.round(svc * 100)}%`}
                            </td>
                            <td className={cx(td, "text-muted")}>
                              {tel.position}
                              <div className="text-[12.5px] text-dim">fuel {tel.fuel_pct}%</div>
                            </td>
                            <td className={cx(td, "text-[13px] text-dim")}>{timeAgo(a.meta?.updated_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
                {tab === "crews" && (
                  <>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {["Crew", "Call sign", "Base", "Qualified on", "Shift", "Status"].map((h) => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {world.crews.map((c) => {
                        const checked = live.checkedIn.includes(c.id) || c.checked_in;
                        return (
                          <tr key={c.id} className="hover:bg-panel-2">
                            <td className={cx(td, "num font-semibold")}>{c.id}</td>
                            <td className={td}>{c.callsign}</td>
                            <td className={td}>{c.base_id}</td>
                            <td className={td}>{c.qualified_types.map((q) => types[q]).join(", ")}</td>
                            <td className={cx(td, "num text-muted")}>
                              {hhmm(c.duty_start)} to {hhmm(c.duty_end)}
                            </td>
                            <td className={td}>
                              {c.status !== "available" ? <Pill tone="bad">Unavailable</Pill> : checked ? <Pill tone="info">On duty</Pill> : <Pill>Off shift</Pill>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
                {tab === "weapons" && (
                  <>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {["Weapon", "Use", "Fits", ...world.bases.map((b) => `Stock ${b.id}`)].map((h) => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {world.weapon_types.map((w) => (
                        <tr key={w.id} className="hover:bg-panel-2">
                          <td className={td}>
                            <div className="num font-semibold">{w.id}</div>
                            <div className="text-[13px] text-dim">{w.name}</div>
                          </td>
                          <td className={cx(td, "capitalize")}>{w.category}</td>
                          <td className={td}>{w.compatible_types.map((t) => types[t]).join(", ")}</td>
                          {world.bases.map((b) => (
                            <td key={b.id} className={cx(td, "num font-medium")}>
                              {world.stock.find((s) => s.base_id === b.id && s.weapon_id === w.id)?.qty ?? 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {tab === "missions" && (
                  <>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {["Mission", "Type", "Zone", "Take-off window", "Length", "Aircraft", "From"].map((h) => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {world.missions
                        .slice()
                        .sort((a, b) => a.priority - b.priority || a.window_start - b.window_start)
                        .map((m) => (
                          <tr key={m.id} className={cx("hover:bg-panel-2", m.status === "cancelled" && "opacity-60")}>
                            <td className={td}>
                              <div className="flex items-center gap-2">
                                <PriorityTag p={m.priority} compact />
                                <span className="num font-semibold">{m.id}</span>
                              </div>
                              <div className="mt-0.5 text-[13px] text-dim">{m.name}</div>
                            </td>
                            <td className={td}>{mtypes[m.type_id]}</td>
                            <td className={cx(td, "num")}>{m.zone_id}</td>
                            <td className={cx(td, "num")}>
                              {hhmm(m.window_start)}
                              {m.window_end !== m.window_start && ` to ${hhmm(m.window_end)}`}
                            </td>
                            <td className={cx(td, "num")}>{m.duration_min} min</td>
                            <td className={cx(td, "num")}>{m.aircraft_required}</td>
                            <td className={cx(td, "text-muted")}>{m.status === "cancelled" ? "Cancelled" : m.origin}</td>
                          </tr>
                        ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </Card>

        <Card className="sticky top-[88px] h-[calc(100vh-120px)] min-h-[420px] overflow-hidden">
          <LiveFeed showEvents={false} />
        </Card>
      </div>

      <NextStep href="/plan" label="Mission plan" hint="Aeolus uses all of this data to build the plan." />
    </div>
  );
}
