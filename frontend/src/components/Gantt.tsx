"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { cx, hhmm, PRIORITY_COLOR, PRIORITY_INK, sortieKey, STRENGTH } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Aircraft, Change, Fragility, Mission, Plan, Sortie, World } from "@/lib/types";
import { Skeleton } from "./ui";

const LABEL_W = 210;
const ROW_H = 36;

function pct(t: number, h0: number, h1: number) {
  return ((Math.min(Math.max(t, h0), h1) - h0) / (h1 - h0)) * 100;
}

function span(a: number, b: number, h0: number, h1: number) {
  return { left: `${pct(a, h0, h1)}%`, width: `${Math.max(0.3, pct(b, h0, h1) - pct(a, h0, h1))}%` };
}

function AircraftRow({
  a,
  world,
  sorties,
  ghosts,
  frag,
  changeBy,
  highlight,
  slot,
  h0,
  h1,
}: {
  a: Aircraft;
  world: World;
  sorties: Sortie[];
  ghosts: Sortie[];
  frag: Record<string, Fragility>;
  changeBy: Record<string, Change>;
  highlight: Set<string>;
  slot: Record<string, number>;
  h0: number;
  h1: number;
}) {
  const select = useStore((s) => s.setSelected);
  const hover = useStore((s) => s.hoverMission);
  const setHover = useStore((s) => s.setHoverMission);
  const type = world.aircraft_types.find((t) => t.id === a.type_id)!;
  const svc = world.serviceability[a.id];
  const missions = useMemo(() => Object.fromEntries(world.missions.map((m) => [m.id, m])), [world.missions]);
  const lowWx = world.weather.filter(
    (w) => w.location_id === a.base_id && w.kind === "forecast" && w.end > h0 && (w.ceiling_ft < type.min_ceiling_ft || w.vis_km < type.min_vis_km),
  );
  const closures = world.weather.filter((w) => w.location_id === a.base_id && w.kind === "closure");
  const down = a.status !== "serviceable";
  const airborne = a.telemetry.position.startsWith("airborne");

  return (
    <div className="flex border-b border-line/70" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-white pl-5 pr-3"
        style={{ width: LABEL_W }}
        title={`${a.id}, ${type.name} at ${a.base_id}. ${a.telemetry.position}, fuel ${a.telemetry.fuel_pct}%.`}
      >
        <span className={cx("h-2 w-2 shrink-0 rounded-full", airborne ? "live-dot bg-primary" : down ? "bg-coral" : "bg-line-2")} />
        <span className={cx("num text-[14px] font-medium", down ? "text-dim line-through" : "text-text")}>{a.id}</span>
        <span className="truncate text-[13px] text-dim">{type.name}</span>
        <span
          className={cx("num ml-auto text-[13px]", down ? "text-coral" : svc === undefined ? "text-dim" : svc < 0.5 ? "text-coral" : svc < 0.75 ? "text-amber" : "text-muted")}
          title="Predicted chance this aircraft is ready to fly"
        >
          {down ? "Down" : svc === undefined ? "" : `${Math.round(svc * 100)}%`}
        </span>
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 bg-navy/[0.035]" style={{ width: `${pct(world.now, h0, h1)}%` }} />
        {lowWx.map((w, i) => (
          <div key={`wx${i}`} className="hatch-soft absolute inset-y-0" style={span(w.start, w.end, h0, h1)} title={`${a.base_id} weather below ${type.name} limits (${w.note})`} />
        ))}
        {closures.map((w, i) => (
          <div key={`cl${i}`} className="absolute inset-y-0 border-x border-coral/30 bg-coral/8" style={span(w.start, w.end, h0, h1)} title={`${a.base_id} closed ${hhmm(w.start)} to ${hhmm(w.end)}`} />
        ))}
        {a.unavailable.map((w, i) => (
          <div key={`u${i}`} className="hatch absolute inset-y-[5px] rounded-md" style={span(w.start, w.end, h0, h1)} title={`${a.id} unavailable ${hhmm(w.start)} to ${hhmm(w.end)}: ${w.reason}`}>
            {pct(w.end, h0, h1) - pct(w.start, h0, h1) > 9 && <span className="absolute left-2 top-[5px] text-[12px] text-coral">{w.reason}</span>}
          </div>
        ))}
        {ghosts.map((s) => (
          <div
            key={`g${sortieKey(s)}`}
            className="absolute top-[5px] rounded-md border-2 border-dashed border-amber/60"
            style={{ ...span(s.takeoff, s.landing, h0, h1), height: ROW_H - 10 }}
            title={`Old slot for ${s.mission_id} (moved or dropped in the proposal)`}
          >
            <span className="num absolute left-1.5 top-[3px] text-[11.5px] text-amber">{s.mission_id}</span>
          </div>
        ))}
        {sorties.map((s) => {
          const m: Mission | undefined = missions[s.mission_id];
          const p = m?.priority ?? 4;
          const ta = span(s.landing, s.landing + type.turnaround_min, h0, h1);
          const f = frag[sortieKey(s)];
          const st = f ? STRENGTH[f.level] : null;
          const committed = s.takeoff < world.now;
          const key = sortieKey(s);
          return (
            <div key={key}>
              <div className="absolute bottom-[6px] h-[3px] rounded-r-sm bg-primary-100" style={ta} />
              <motion.button
                layoutId={`bar-${s.mission_id}-${slot[key] ?? 0}`}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                onClick={() => select(s)}
                onMouseEnter={() => setHover(s.mission_id)}
                onMouseLeave={() => setHover(null)}
                className={cx(
                  "absolute top-[5px] flex items-center gap-1.5 overflow-hidden rounded-md pl-2 pr-1 text-left shadow-sm transition-[filter] duration-200 hover:brightness-110",
                  hover === s.mission_id && "z-10 ring-[3px] ring-amber-400 ring-offset-1",
                  highlight.has(key) && "changed-pulse",
                  changeBy[key] && !highlight.has(key) && "outline-2 outline-offset-1 outline-amber/70",
                  committed && "opacity-70",
                )}
                style={{ ...span(s.takeoff, s.landing, h0, h1), height: ROW_H - 10, background: PRIORITY_COLOR[p], color: PRIORITY_INK[p] }}
                title={`${s.mission_id} ${m?.name ?? ""}, ${hhmm(s.takeoff)} to ${hhmm(s.landing)}, crew ${s.crew_id}${st ? `, ${st.label}` : ""}. Click for details.`}
                aria-label={`${s.mission_id} priority ${p}, ${hhmm(s.takeoff)} to ${hhmm(s.landing)}, aircraft ${s.aircraft_id}, crew ${s.crew_id}${st ? `, plan strength ${st.label}` : ""}. Open details.`}
              >
                {committed && <Lock size={11} className="shrink-0 opacity-80" />}
                <span className="num text-[12.5px] font-semibold">{s.mission_id}</span>
                <span className="num text-[11.5px] font-semibold opacity-80">P{p}</span>
                <span className="num truncate text-[11.5px] opacity-75">{s.crew_id}</span>
                {st && (
                  <span
                    className="num ml-auto flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white text-[10.5px] font-bold shadow-sm"
                    style={{ color: st.color }}
                    aria-hidden
                  >
                    {st.short}
                  </span>
                )}
              </motion.button>
            </div>
          );
        })}
        <div className="absolute inset-y-0 w-0.5 bg-primary-dark/70" style={{ left: `${pct(world.now, h0, h1)}%` }} />
      </div>
    </div>
  );
}

function AirspaceLane({ world, h0, h1 }: { world: World; h0: number; h1: number }) {
  const items = [
    ...world.restrictions.map((r) => ({ key: `r${r.id}`, start: r.start, end: r.end, text: `${r.zone_id} restricted`, tone: "warn" as const, title: r.reason })),
    ...world.weather
      .filter((w) => w.kind === "closure" && w.location_id.startsWith("Z"))
      .map((w, i) => ({ key: `wz${i}`, start: w.start, end: w.end, text: `${w.location_id} weather closed`, tone: "bad" as const, title: "weather closure" })),
    ...world.threats
      .filter((t) => t.level >= 3)
      .map((t) => ({ key: `t${t.id}`, start: Math.max(t.start, h0), end: t.end, text: `${t.zone_id} high threat`, tone: "bad" as const, title: t.note })),
  ];
  const rows: (typeof items)[] = [];
  for (const it of items.sort((a, b) => a.start - b.start)) {
    const row = rows.find((r) => r[r.length - 1].end <= it.start);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return (
    <div className="flex border-b border-line bg-panel-2">
      <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-panel-2 pl-5" style={{ width: LABEL_W }}>
        <span className="text-[13px] font-semibold text-muted">Airspace</span>
      </div>
      <div className="relative flex-1" style={{ height: Math.max(1, rows.length) * 24 + 10 }}>
        {items.length === 0 && <span className="absolute left-3 top-[8px] text-[13px] text-dim">No restrictions or closures</span>}
        {rows.map((row, ri) =>
          row.map((it) => (
            <div
              key={it.key}
              title={`${it.text} ${hhmm(it.start)} to ${hhmm(it.end)}: ${it.title}`}
              className={cx(
                "absolute flex h-[20px] items-center overflow-hidden rounded-md border px-1.5 text-[12px] font-medium",
                it.tone === "warn" ? "border-amber/30 bg-amber-dim text-amber" : "border-coral/30 bg-coral-dim text-coral",
              )}
              style={{ top: 5 + ri * 24, left: `${pct(it.start, h0, h1)}%`, width: `${Math.max(3, pct(it.end, h0, h1) - pct(it.start, h0, h1))}%` }}
            >
              <span className="truncate">{it.text}</span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

export function GanttLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
      {[1, 2, 3, 4].map((p) => (
        <span key={p} className="flex items-center gap-1.5">
          <span className="num flex h-5 items-center rounded px-1.5 text-[11px] font-semibold" style={{ background: PRIORITY_COLOR[p], color: PRIORITY_INK[p] }}>
            P{p}
          </span>
          {["critical", "high", "routine", "low"][p - 1]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        {(["low", "medium", "high"] as const).map((l) => (
          <span key={l} className="num flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-white text-[10.5px] font-bold" style={{ color: STRENGTH[l].color }}>
            {STRENGTH[l].short}
          </span>
        ))}
        plan strength
      </span>
      <span className="flex items-center gap-1.5">
        <span className="hatch h-3.5 w-5 rounded" /> aircraft down
      </span>
      <span className="flex items-center gap-1.5">
        <span className="hatch-soft h-3.5 w-5 rounded border border-line" /> weather below limits
      </span>
      <span className="flex items-center gap-1.5">
        <Lock size={13} /> already flying
      </span>
    </div>
  );
}

export default function Gantt() {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const highlight = useStore((s) => s.highlight);
  const live = useStore((s) => s.live);
  const [, tick] = useState(0);
  useEffect(() => {
    if (Date.now() >= highlight.until) return;
    const id = setTimeout(() => tick((t) => t + 1), highlight.until - Date.now() + 50);
    return () => clearTimeout(id);
  }, [highlight]);

  const proposal = plan?.proposal ?? null;
  const showProposal = !!proposal && (view === "proposal" || !plan?.active);
  const shown: Plan | null = showProposal ? proposal!.plan : plan?.active ?? null;
  const frag = (showProposal ? proposal!.fragility : plan?.active_fragility) ?? {};
  const changes = showProposal ? proposal!.changes : [];
  const changeBy = useMemo(() => {
    const out: Record<string, Change> = {};
    for (const c of changes) if (c.new) out[`${c.mission_id}/${c.new.aircraft_id}`] = c;
    return out;
  }, [changes]);
  const highlightSet = useMemo(() => new Set(Date.now() < highlight.until ? highlight.keys : []), [highlight]);

  if (!world || !plan) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
    );
  }

  const h0 = world.rules.horizon_start;
  const h1 = world.rules.horizon_end;
  const hours = Array.from({ length: (h1 - h0) / 60 + 1 }, (_, i) => h0 + i * 60);
  // stable slot per mission so a bar can animate from its old aircraft row to its new one
  const slot: Record<string, number> = {};
  const perMission: Record<string, Sortie[]> = {};
  for (const s of shown?.sorties ?? []) (perMission[s.mission_id] ||= []).push(s);
  for (const list of Object.values(perMission)) list.sort((x, y) => x.crew_id.localeCompare(y.crew_id)).forEach((s, i) => (slot[sortieKey(s)] = i));
  const byAircraft: Record<string, Sortie[]> = {};
  for (const s of shown?.sorties ?? []) (byAircraft[s.aircraft_id] ||= []).push(s);
  const ghostsBy: Record<string, Sortie[]> = {};
  for (const c of changes) {
    if (!c.old || !(c.kind === "removed" || c.kind === "aircraft_swap" || c.kind === "retimed")) continue;
    (ghostsBy[c.old.aircraft_id] ||= []).push({ mission_id: c.mission_id, aircraft_id: c.old.aircraft_id, crew_id: c.old.crew_id, takeoff: c.old.takeoff, landing: c.old.landing, loadout: {} });
  }

  return (
    <div className="flex flex-col">
      {proposal && plan.active && (
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span className="text-[13.5px] text-muted">Showing</span>
          <div className="flex rounded-xl border border-line bg-panel-2 p-1 text-[13.5px]" role="tablist" aria-label="Plan shown">
            {(["proposal", "active"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={(v === "proposal") === showProposal}
                onClick={() => setView(v)}
                className={cx("rounded-lg px-3 py-1 font-medium", (v === "proposal") === showProposal ? "bg-white text-primary-dark shadow-sm" : "text-muted hover:text-text")}
              >
                {v === "proposal" ? "Proposed plan" : "Current live plan"}
              </button>
            ))}
          </div>
          {showProposal && <span className="text-[13px] text-dim">Dashed outlines show where changed missions used to be.</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-20 flex border-b border-line bg-white">
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-white pl-5 text-[13px] font-semibold text-muted" style={{ width: LABEL_W }}>
              Aircraft
            </div>
            <div className="relative h-9 flex-1">
              {hours.map((t) =>
                t === h1 ? null : (
                  <span key={t} className={cx("num absolute top-2 text-[12.5px] text-dim", t === h0 ? "pl-1.5" : "-translate-x-1/2")} style={{ left: `${pct(t, h0, h1)}%` }}>
                    {hhmm(t)}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
              {hours.map((t) => (
                <div key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${pct(t, h0, h1)}%` }} />
              ))}
            </div>
            <AirspaceLane world={world} h0={h0} h1={h1} />
            {world.bases.map((b) => {
              const obs = live.observations[b.id] ?? world.observations[b.id];
              const rows = world.aircraft.filter((a) => a.base_id === b.id);
              return (
                <div key={b.id}>
                  <div className="flex h-9 items-center gap-3 border-b border-line bg-primary-50/60 pl-5 text-[13px]">
                    <span className="sticky left-5 font-semibold text-primary-dark">{b.name}</span>
                    <span className="text-dim">{rows.length} aircraft</span>
                    {obs && (
                      <span className="text-muted" title="Latest live weather report">
                        Weather now: cloud base {obs.ceiling_ft} ft, visibility {obs.vis_km} km
                      </span>
                    )}
                  </div>
                  {rows.map((a) => (
                    <AircraftRow
                      key={a.id}
                      a={{ ...a, telemetry: live.telemetry[a.id] ?? a.telemetry }}
                      world={world}
                      sorties={byAircraft[a.id] ?? []}
                      ghosts={ghostsBy[a.id] ?? []}
                      frag={frag}
                      changeBy={changeBy}
                      highlight={highlightSet}
                      slot={slot}
                      h0={h0}
                      h1={h1}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
