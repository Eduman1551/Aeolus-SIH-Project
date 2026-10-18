"use client";

import { CalendarRange, Loader2, Lock, Play, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cx, FRAGILITY_COLOR, hhmm, PRIORITY_COLOR, PRIORITY_LABEL, secs, sortieKey } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Aircraft, Change, Fragility, Mission, Plan, Sortie, World } from "@/lib/types";
import { Button, Empty, PriorityTag } from "./ui";

const LABEL_W = 176;
const ROW_H = 25;

interface Hover {
  sortie: Sortie;
  ghost?: boolean;
  x: number;
  y: number;
}

function useTicker(active: boolean, ms = 100) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

function SolvingOverlay() {
  const busy = useStore((s) => s.busy);
  useTicker(!!busy);
  if (!busy) return null;
  const elapsed = (performance.now() - busy.startedAt) / 1000;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/55 backdrop-blur-[1px]">
      <div className="fade-in flex items-center gap-3 rounded-md border border-line-2 bg-panel-2 px-4 py-3 shadow-xl shadow-black/40">
        <Loader2 className="spin text-amber" size={18} />
        <div>
          <div className="text-[13px] font-medium">{busy.label}</div>
          <div className="mono text-[12px] text-muted">elapsed {elapsed.toFixed(1)} s</div>
        </div>
      </div>
    </div>
  );
}

function ResultBadge() {
  const badge = useStore((s) => s.resultBadge);
  useTicker(!!badge, 1000);
  if (!badge || Date.now() - badge.at > 60000) return null;
  const hit = badge.text.includes("cache hit");
  return (
    <span
      className={cx(
        "fade-in mono inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-[3px] text-[11.5px]",
        badge.tone === "ok" ? "border-teal/40 bg-teal-dim/30 text-teal" : "border-amber/40 bg-amber-dim/30 text-amber",
      )}
    >
      {hit && <Zap size={12} className="shrink-0" />}
      <span className="truncate" title={badge.text}>{badge.text}</span>
    </span>
  );
}

function pct(t: number, h0: number, h1: number) {
  return ((Math.min(Math.max(t, h0), h1) - h0) / (h1 - h0)) * 100;
}

function Tooltip({ h, world, frag, change }: { h: Hover; world: World; frag?: Fragility; change?: Change }) {
  const s = h.sortie;
  const m = world.missions.find((x) => x.id === s.mission_id);
  const a = world.aircraft.find((x) => x.id === s.aircraft_id);
  const c = world.crews.find((x) => x.id === s.crew_id);
  const type = world.aircraft_types.find((t) => t.id === a?.type_id);
  const svc = world.serviceability[s.aircraft_id];
  const left = Math.min(h.x + 14, window.innerWidth - 330);
  const top = Math.min(h.y + 14, window.innerHeight - 260);
  const committed = s.takeoff < world.now;
  return (
    <div className="pointer-events-none fixed z-50 w-[310px] rounded-md border border-line-2 bg-panel-2 p-3 text-[12px] shadow-2xl shadow-black/50" style={{ left, top }}>
      <div className="flex items-center gap-2">
        {m && <PriorityTag p={m.priority} />}
        <span className="mono font-semibold">{s.mission_id}</span>
        <span className="truncate text-muted">{m?.name}</span>
      </div>
      {h.ghost && <div className="mt-1 text-[11px] text-amber">Previous assignment (removed in this proposal)</div>}
      <dl className="mt-2 grid grid-cols-[78px_1fr] gap-x-2 gap-y-1">
        <dt className="text-dim">Window</dt>
        <dd className="mono">
          {hhmm(s.takeoff)} - {hhmm(s.landing)} {committed && <span className="text-muted">(committed)</span>}
        </dd>
        <dt className="text-dim">Mission</dt>
        <dd>
          {m ? `${world.mission_types.find((t) => t.id === m.type_id)?.name} on ${m.zone_id}` : "-"}
          {m && ` · ${PRIORITY_LABEL[m.priority]}`}
        </dd>
        <dt className="text-dim">Aircraft</dt>
        <dd>
          <span className="mono">{s.aircraft_id}</span> {type?.name} · {a?.base_id}
          {svc !== undefined && <span className={svc < 0.7 ? "text-coral" : "text-muted"}> · {Math.round(svc * 100)}% svc</span>}
        </dd>
        <dt className="text-dim">Crew</dt>
        <dd>
          <span className="mono">{s.crew_id}</span> {c ? `'${c.callsign}'` : ""}
        </dd>
        <dt className="text-dim">Weapons</dt>
        <dd className="mono">
          {Object.keys(s.loadout).length ? Object.entries(s.loadout).map(([w, q]) => `${q}x ${w}`).join(", ") : "none"}
        </dd>
        {frag && (
          <>
            <dt className="text-dim">Fragility</dt>
            <dd>
              <span style={{ color: FRAGILITY_COLOR[frag.level] }} className="font-medium capitalize">
                {frag.level}
              </span>{" "}
              <span className="text-muted">· {frag.note}</span>
            </dd>
          </>
        )}
      </dl>
      {change && (
        <div className="mt-2 border-t border-line pt-2 leading-5">
          <span className="label text-[10.5px] text-amber">Why it changed</span>
          <p className="text-text">{change.reason}</p>
        </div>
      )}
    </div>
  );
}

function AircraftRow({
  a,
  world,
  sorties,
  ghosts,
  frag,
  changeBy,
  highlight,
  h0,
  h1,
  onHover,
}: {
  a: Aircraft;
  world: World;
  sorties: Sortie[];
  ghosts: Sortie[];
  frag: Record<string, Fragility>;
  changeBy: Record<string, Change>;
  highlight: Set<string>;
  h0: number;
  h1: number;
  onHover: (h: Hover | null) => void;
}) {
  const type = world.aircraft_types.find((t) => t.id === a.type_id)!;
  const svc = world.serviceability[a.id];
  const missions = useMemo(() => Object.fromEntries(world.missions.map((m) => [m.id, m])), [world.missions]);
  const lowWx = world.weather.filter(
    (w) => w.location_id === a.base_id && w.kind === "forecast" && w.end > h0 && (w.ceiling_ft < type.min_ceiling_ft || w.vis_km < type.min_vis_km),
  );
  const closures = world.weather.filter((w) => w.location_id === a.base_id && w.kind === "closure");
  const down = a.status !== "serviceable";
  const tel = a.telemetry;
  const airborne = tel.position.startsWith("airborne");

  return (
    <div className="flex border-b border-line/60" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-panel pl-3 pr-2"
        style={{ width: LABEL_W }}
        title={`${a.id} ${type.name} at ${a.base_id}. ${tel.position}, fuel ${tel.fuel_pct}%. Serviceability predicted from maintenance data (model trained on synthetic data).`}
      >
        <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", airborne ? "live-dot bg-teal" : down ? "bg-coral" : "bg-line-2")} />
        <span className={cx("mono text-[12px]", down ? "text-dim line-through" : "text-text")}>{a.id}</span>
        <span className="truncate text-[11px] text-dim">{type.name}</span>
        <span
          className={cx("mono ml-auto text-[11px]", svc === undefined ? "text-dim" : svc < 0.5 ? "text-coral" : svc < 0.75 ? "text-amber" : "text-muted")}
        >
          {down ? "U/S" : svc === undefined ? "" : `${Math.round(svc * 100)}%`}
        </span>
      </div>
      <div className="relative flex-1">
        {/* past */}
        <div className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${pct(world.now, h0, h1)}%` }} />
        {/* forecast below this type's minimums */}
        {lowWx.map((w, i) => (
          <div
            key={`wx${i}`}
            className="hatch-soft absolute inset-y-0"
            style={{ left: `${pct(w.start, h0, h1)}%`, width: `${pct(w.end, h0, h1) - pct(w.start, h0, h1)}%` }}
            title={`${a.base_id} forecast ${w.ceiling_ft} ft / ${w.vis_km} km is below ${type.name} minimums (${w.note})`}
          />
        ))}
        {closures.map((w, i) => (
          <div
            key={`cl${i}`}
            className="absolute inset-y-0 border-x border-coral/40 bg-coral/12"
            style={{ left: `${pct(w.start, h0, h1)}%`, width: `${pct(w.end, h0, h1) - pct(w.start, h0, h1)}%` }}
            title={`${a.base_id} closed ${hhmm(w.start)}-${hhmm(w.end)}`}
          />
        ))}
        {/* unavailability */}
        {a.unavailable.map((w, i) => (
          <div
            key={`u${i}`}
            className="hatch absolute inset-y-[3px] rounded-sm"
            style={{ left: `${pct(w.start, h0, h1)}%`, width: `${Math.max(0.3, pct(w.end, h0, h1) - pct(w.start, h0, h1))}%` }}
            title={`${a.id} unavailable ${hhmm(w.start)}-${hhmm(w.end)}: ${w.reason}`}
          >
            {pct(w.end, h0, h1) - pct(w.start, h0, h1) > 9 && (
              <span className="absolute left-1.5 top-[3px] text-[10px] text-[#ffc9c3]/80">{w.reason}</span>
            )}
          </div>
        ))}
        {ghosts.map((s) => (
          <div
            key={`g${sortieKey(s)}`}
            className="absolute top-[3px] rounded-[3px] border border-dashed border-amber/70"
            style={{ left: `${pct(s.takeoff, h0, h1)}%`, width: `${pct(s.landing, h0, h1) - pct(s.takeoff, h0, h1)}%`, height: ROW_H - 7 }}
            onMouseMove={(e) => onHover({ sortie: s, ghost: true, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
          >
            <span className="mono absolute left-1 top-[2px] text-[10px] text-amber/80">{s.mission_id}</span>
          </div>
        ))}
        {/* sorties */}
        {sorties.map((s) => {
          const m: Mission | undefined = missions[s.mission_id];
          const p = m?.priority ?? 4;
          const left = pct(s.takeoff, h0, h1);
          const width = pct(s.landing, h0, h1) - left;
          const taWidth = pct(s.landing + type.turnaround_min, h0, h1) - pct(s.landing, h0, h1);
          const f = frag[sortieKey(s)];
          const committed = s.takeoff < world.now;
          const changed = !!changeBy[sortieKey(s)];
          return (
            <div key={sortieKey(s)}>
              <div
                className="absolute bottom-[4px] h-[3px] rounded-r-sm bg-muted/25"
                style={{ left: `${left + width}%`, width: `${taWidth}%` }}
                title={`turnaround ${type.turnaround_min} min`}
              />
              <div
                className={cx(
                  "absolute top-[3px] flex cursor-default items-center gap-1 overflow-hidden rounded-[3px] pl-1.5 pr-0.5 text-[#0b0f14] transition-[left,width] duration-300",
                  highlight.has(sortieKey(s)) && "changed-pulse",
                  changed && !highlight.has(sortieKey(s)) && "ring-1 ring-amber/80",
                  committed && "saturate-[0.55]",
                )}
                style={{ left: `${left}%`, width: `${width}%`, height: ROW_H - 7, background: PRIORITY_COLOR[p] }}
                onMouseMove={(e) => onHover({ sortie: s, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => onHover(null)}
                role="img"
                aria-label={`${s.mission_id} priority ${p}, ${hhmm(s.takeoff)} to ${hhmm(s.landing)}, ${s.aircraft_id} crew ${s.crew_id}${f ? `, fragility ${f.level}` : ""}`}
              >
                {committed && <Lock size={10} className="shrink-0 opacity-70" />}
                <span className="mono text-[11px] font-semibold">{s.mission_id}</span>
                <span className="mono text-[10px] font-semibold opacity-75">P{p}</span>
                <span className="mono truncate text-[10px] opacity-70">{s.crew_id}</span>
                {f && (
                  <span
                    className="mono ml-auto flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[2px] text-[9px] font-bold text-[#0b0f14] ring-1 ring-black/30"
                    style={{ background: FRAGILITY_COLOR[f.level] }}
                    title={`Fragility ${f.level}: ${f.note}`}
                  >
                    {f.level[0].toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {/* now */}
        <div className="absolute inset-y-0 w-px bg-amber/80" style={{ left: `${pct(world.now, h0, h1)}%` }} />
      </div>
    </div>
  );
}

function AirspaceLane({ world, h0, h1 }: { world: World; h0: number; h1: number }) {
  const items = [
    ...world.restrictions.map((r) => ({ key: `r${r.id}`, start: r.start, end: r.end, text: `${r.zone_id} restricted`, tone: "warn" as const, title: r.reason })),
    ...world.weather
      .filter((w) => w.kind === "closure" && w.location_id.startsWith("Z"))
      .map((w, i) => ({ key: `wz${i}`, start: w.start, end: w.end, text: `${w.location_id} wx closed`, tone: "bad" as const, title: "weather closure" })),
    ...world.threats
      .filter((t) => t.level >= 3)
      .map((t) => ({ key: `t${t.id}`, start: Math.max(t.start, h0), end: t.end, text: `${t.zone_id} threat L${t.level}`, tone: "bad" as const, title: t.note })),
  ];
  const rows: typeof items[] = [];
  for (const it of items.sort((a, b) => a.start - b.start)) {
    const row = rows.find((r) => r[r.length - 1].end <= it.start);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return (
    <div className="flex border-b border-line bg-panel-2/40">
      <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-panel pl-3" style={{ width: LABEL_W }}>
        <span className="label text-[11px] text-dim">Airspace</span>
      </div>
      <div className="relative flex-1 py-[3px]" style={{ height: Math.max(1, rows.length) * 18 + 6 }}>
        {items.length === 0 && <span className="absolute left-2 top-[5px] text-[11px] text-dim">No restrictions or closures</span>}
        {rows.map((row, ri) =>
          row.map((it) => (
            <div
              key={it.key}
              title={`${it.text} ${hhmm(it.start)}-${hhmm(it.end)} · ${it.title}`}
              className={cx(
                "absolute flex h-[15px] items-center overflow-hidden rounded-sm border px-1 text-[10px]",
                it.tone === "warn" ? "border-amber/50 bg-amber-dim/40 text-amber" : "border-coral/50 bg-coral-dim/50 text-[#ffb4ab]",
              )}
              style={{ top: 3 + ri * 18, left: `${pct(it.start, h0, h1)}%`, width: `${Math.max(2.5, pct(it.end, h0, h1) - pct(it.start, h0, h1))}%` }}
            >
              <span className="truncate">{it.text}</span>
            </div>
          )),
        )}
      </div>
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
  const generate = useStore((s) => s.generate);
  const busy = useStore((s) => s.busy);
  const [hover, setHover] = useState<Hover | null>(null);
  useTicker(Date.now() < highlight.until, 500);

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
  const ghostChange = useMemo(() => {
    const out: Record<string, Change> = {};
    for (const c of changes) if (c.old && (c.kind === "removed" || c.kind === "aircraft_swap" || c.kind === "retimed")) out[`${c.mission_id}/${c.old.aircraft_id}`] = c;
    return out;
  }, [changes]);
  const highlightSet = useMemo(() => new Set(Date.now() < highlight.until ? highlight.keys : []), [highlight]);

  if (!world || !plan) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="spin mr-2" size={16} /> Loading the fused picture...
      </div>
    );
  }

  const h0 = world.rules.horizon_start;
  const h1 = world.rules.horizon_end;
  const hours = Array.from({ length: (h1 - h0) / 60 + 1 }, (_, i) => h0 + i * 60);
  const byAircraft: Record<string, Sortie[]> = {};
  for (const s of shown?.sorties ?? []) (byAircraft[s.aircraft_id] ||= []).push(s);
  const ghostsBy: Record<string, Sortie[]> = {};
  for (const c of changes) {
    if (!c.old || !(c.kind === "removed" || c.kind === "aircraft_swap" || c.kind === "retimed")) continue;
    (ghostsBy[c.old.aircraft_id] ||= []).push({ mission_id: c.mission_id, aircraft_id: c.old.aircraft_id, crew_id: c.old.crew_id, takeoff: c.old.takeoff, landing: c.old.landing, loadout: {} });
  }
  const hoverChange = hover ? (hover.ghost ? ghostChange[sortieKey(hover.sortie)] : changeBy[sortieKey(hover.sortie)]) : undefined;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 overflow-hidden border-b border-line px-3">
        <h2 className="label whitespace-nowrap text-[13px] text-text">Air tasking timeline</h2>
        {proposal && plan.active && (
          <div className="flex rounded-md border border-line-2 bg-bg p-0.5 text-[12px]" role="tablist" aria-label="Plan shown">
            {(["proposal", "active"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={(v === "proposal") === showProposal}
                onClick={() => setView(v)}
                className={cx("rounded px-2 py-0.5", (v === "proposal") === showProposal ? "bg-panel-3 text-text" : "text-muted hover:text-text")}
              >
                {v === "proposal" ? "Proposed" : "Active"}
              </button>
            ))}
          </div>
        )}
        {shown && (
          <span className="mono hidden whitespace-nowrap text-[11.5px] text-muted 2xl:inline">
            {shown.id} · {shown.sorties.length} sorties · {shown.source === "cache" ? "from cache" : shown.solver_status.toLowerCase()}
          </span>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <ResultBadge />
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {/* time axis */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-panel">
          <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-panel" style={{ width: LABEL_W }} />
          <div className="relative h-6 flex-1">
            {hours.map((t) => (
              <span key={t} className="mono absolute top-1 -translate-x-1/2 text-[10.5px] text-dim" style={{ left: `${pct(t, h0, h1)}%` }}>
                {t === h1 ? "" : hhmm(t).slice(0, 2)}
              </span>
            ))}
            <span
              className="mono absolute top-0.5 -translate-x-1/2 rounded-sm bg-amber px-1 text-[10.5px] font-semibold text-[#1a1306]"
              style={{ left: `${pct(world.now, h0, h1)}%` }}
            >
              {hhmm(world.now)}
            </span>
          </div>
        </div>

        <div
          className="relative min-w-[720px]"
          style={{
            backgroundImage: `linear-gradient(to right, transparent ${LABEL_W}px, transparent ${LABEL_W}px)`,
          }}
        >
          {/* hour grid */}
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
                <div className="sticky left-0 flex h-6 items-center gap-3 border-b border-line bg-panel-2/70 pl-3 text-[11px]">
                  <span className="label text-[12px] text-text">{b.name}</span>
                  <span className="text-dim">{rows.length} aircraft</span>
                  {obs && (
                    <span className="mono text-muted" title="Latest live weather observation from the feed">
                      obs {obs.ceiling_ft} ft / {obs.vis_km} km at {obs.at}
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
                    h0={h0}
                    h1={h1}
                    onHover={setHover}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {!shown && (
          <div className="pointer-events-none absolute inset-0 top-6 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg border border-line-2 bg-panel/95 px-6 py-2 shadow-2xl shadow-black/50 backdrop-blur-sm">
              <Empty icon={<CalendarRange size={26} />} title="No plan yet">
                The picture below is live: fleet, crews, weather, airspace and threats are fused from 8 synthetic sources.
                Generate a plan to assign aircraft, crews and weapons to the {world.missions.filter((m) => m.status === "open").length} open missions.
              </Empty>
              <div className="-mt-4 mb-5 flex justify-center">
                <Button variant="primary" icon={<Play size={14} />} onClick={generate} disabled={!!busy}>
                  Generate initial plan
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-line px-3 text-[10.5px] text-dim">
        {[1, 2, 3, 4].map((p) => (
          <span key={p} className="flex items-center gap-1">
            <span className="h-2.5 w-3.5 rounded-[2px]" style={{ background: PRIORITY_COLOR[p] }} />P{p}
          </span>
        ))}
        <span className="ml-1 flex items-center gap-1">
          fragility
          {(["low", "medium", "high"] as const).map((l) => (
            <span key={l} className="mono flex h-3 w-3 items-center justify-center rounded-[2px] text-[8px] font-bold text-[#0b0f14]" style={{ background: FRAGILITY_COLOR[l] }}>
              {l[0].toUpperCase()}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="hatch h-2.5 w-3.5 rounded-[2px]" /> down
        </span>
        <span className="flex items-center gap-1">
          <span className="hatch-soft h-2.5 w-3.5 rounded-[2px] border border-line-2" /> below minimums
        </span>
        <span className="flex items-center gap-1">
          <Lock size={10} /> committed
        </span>
        <span className="ml-auto hidden 2xl:inline">Hover a bar for crew, weapons, window and reason</span>
      </div>
      <SolvingOverlay />
      {hover && <Tooltip h={hover} world={world} frag={hover.ghost ? undefined : frag[sortieKey(hover.sortie)]} change={hoverChange} />}
    </div>
  );
}
