"use client";

import { Building2, Crosshair, Plane, UserRound, X } from "lucide-react";
import { useEffect } from "react";
import { cx, hhmm } from "@/lib/format";
import { missionCode, shownPlan, STAGE_LABEL, stageOf } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { Sortie } from "@/lib/types";
import { Pill, PriorityTag } from "./ui";

function Gauge({ value, label }: { value: number; label: string }) {
  // value 0..1, a half-circle meter
  const v = Math.max(0, Math.min(1, value));
  const ang = Math.PI * (1 - v);
  const x = 60 + 48 * Math.cos(ang);
  const y = 60 - 48 * Math.sin(ang);
  const color = v > 0.5 ? "var(--color-coral)" : v > 0.25 ? "var(--color-amber)" : "var(--color-teal)";
  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="70" viewBox="0 0 120 70" aria-label={`${label}: ${Math.round(v * 100)}%`}>
        <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="#e3eaf5" strokeWidth="11" strokeLinecap="round" />
        <path d={`M12 60 A48 48 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
        <text x="60" y="58" fontSize="18" fontWeight="700" textAnchor="middle" fill="var(--color-navy)">
          {Math.round(v * 100)}%
        </text>
      </svg>
      <div className="text-[13.5px] leading-5 text-muted">{label}</div>
    </div>
  );
}

function Meter({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[13.5px]">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">
          {(used / 60).toFixed(1)} h of {(max / 60).toFixed(0)} h
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-primary-50">
        <div className={cx("h-full rounded-full", pct > 90 ? "bg-coral" : pct > 70 ? "bg-amber" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SortieList({ sorties, now }: { sorties: Sortie[]; now: number }) {
  const world = useStore((s) => s.world);
  const select = useStore((s) => s.setSelected);
  if (!sorties.length) return <p className="text-[14px] text-dim">No flights in the plan.</p>;
  return (
    <ul className="divide-y divide-line">
      {sorties.map((s) => {
        const m = world?.missions.find((x) => x.id === s.mission_id);
        const st = stageOf(s, now);
        return (
          <li key={`${s.mission_id}${s.aircraft_id}`}>
            <button onClick={() => select(s)} className="flex w-full items-center gap-2 py-2.5 text-left hover:text-primary-dark">
              {m && <PriorityTag p={m.priority} compact />}
              <span className="num font-semibold">{m ? missionCode(m) : s.mission_id}</span>
              <span className="num text-[13px] text-dim">
                {hhmm(s.takeoff)}-{hhmm(s.landing)}
              </span>
              <Pill tone={st === "complete" ? "neutral" : st === "scheduled" ? "neutral" : "info"} className="ml-auto">
                {STAGE_LABEL[st]}
              </Pill>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function EntityDrawer() {
  const d = useStore((s) => s.drawer);
  const close = useStore((s) => s.openDrawer);
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const live = useStore((s) => s.live);
  const view = useStore((s) => s.view);

  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d, close]);

  if (!d || !world) return null;
  const now = plan?.now ?? world.now;
  const shown = shownPlan(plan, view);
  const sorties = shown?.sorties ?? [];
  const types = Object.fromEntries(world.aircraft_types.map((t) => [t.id, t.name]));

  let icon = <Plane size={20} />;
  let title = "";
  let sub = "";
  let body: React.ReactNode = null;

  if (d.kind === "aircraft") {
    const a = world.aircraft.find((x) => x.id === d.id);
    if (!a) return null;
    const svc = world.serviceability[a.id] ?? 0;
    const tel = live.telemetry[a.id] ?? a.telemetry;
    const mine = sorties.filter((s) => s.aircraft_id === a.id).sort((x, y) => x.takeoff - y.takeoff);
    const history = [
      ...a.unavailable.map((w) => ({ t: w.start, text: `Unavailable ${hhmm(w.start)}-${hhmm(w.end)}: ${w.reason}` })),
      ...(plan?.events ?? []).filter((e) => e.params.aircraft_id === a.id).map((e) => ({ t: e.sim_time, text: `${e.clock} ${e.description}` })),
    ].sort((x, y) => x.t - y.t);
    title = a.callsign || a.id;
    sub = `${a.id} · ${types[a.type_id]} · ${world.bases.find((b) => b.id === a.base_id)?.wing ?? a.base_id}`;
    body = (
      <>
        <Gauge value={a.status === "serviceable" ? 1 - svc : 1} label={a.status === "serviceable" ? "Predicted chance of a fault before the next flight (model trained on synthetic data)" : "Aircraft is down"} />
        <div className="rounded-xl bg-panel-2 px-4 py-3 text-[14px]">
          <div className="text-dim">Now</div>
          <div className="text-text">
            {tel.position}, fuel {tel.fuel_pct}%
          </div>
        </div>
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Flights today</h3>
          <SortieList sorties={mine} now={now} />
        </section>
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Status history</h3>
          {history.length ? (
            <ul className="space-y-1.5 text-[13.5px] text-muted">
              {history.map((h, i) => (
                <li key={i}>{h.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-dim">No faults or outages recorded today.</p>
          )}
          <p className="mt-2 text-[12.5px] text-dim">
            Maintenance: {a.risk.hours_since_maint} h since service, {a.risk.faults_30d} faults in 30 days, {a.risk.days_since_inspection} days since inspection.
          </p>
        </section>
      </>
    );
  } else if (d.kind === "crew") {
    const c = world.crews.find((x) => x.id === d.id);
    if (!c) return null;
    const mine = sorties.filter((s) => s.crew_id === c.id).sort((x, y) => x.takeoff - y.takeoff);
    const used = mine.reduce((t, s) => t + (s.landing - s.takeoff) + world.rules.brief_min + world.rules.debrief_min, 0);
    icon = <UserRound size={20} />;
    title = `Crew ${c.id} "${c.callsign}"`;
    sub = `${c.base_id} · on duty ${hhmm(c.duty_start)}-${hhmm(c.duty_end)} · flies ${c.qualified_types.map((q) => types[q]).join(", ")}`;
    body = (
      <>
        <Meter used={used} max={c.max_duty_min} label="Duty hours planned (incl. briefings)" />
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Flights today</h3>
          <SortieList sorties={mine} now={now} />
        </section>
      </>
    );
  } else if (d.kind === "base") {
    const b = world.bases.find((x) => x.id === d.id);
    if (!b) return null;
    const fleet = world.aircraft.filter((a) => a.base_id === b.id);
    const closures = world.weather.filter((w) => w.location_id === b.id && (w.kind === "closure" || w.ceiling_ft < 1000) && w.end > now);
    icon = <Building2 size={20} />;
    title = b.name;
    sub = b.wing ?? "";
    body = (
      <>
        <section>
          <h3 className="mb-2 text-[14px] font-semibold">Aircraft ({fleet.length})</h3>
          <ul className="grid grid-cols-2 gap-2">
            {fleet.map((a) => {
              const down = a.status !== "serviceable" || a.unavailable.some((w) => w.start <= now && now < w.end);
              return (
                <li key={a.id}>
                  <button onClick={() => close({ kind: "aircraft", id: a.id })} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[13.5px] hover:border-primary">
                    <span>
                      <span className="font-semibold">{a.callsign}</span> <span className="text-dim">{types[a.type_id]}</span>
                    </span>
                    <span className={cx("h-2 w-2 rounded-full", down ? "bg-coral" : "bg-teal")} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Weather ahead</h3>
          {closures.length ? (
            <ul className="space-y-1 text-[13.5px] text-muted">
              {closures.map((w, i) => (
                <li key={i}>
                  {hhmm(w.start)}-{hhmm(w.end)}: {w.kind === "closure" ? "closed" : `cloud base ${w.ceiling_ft} ft (${w.note})`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-dim">No closures or low cloud forecast.</p>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Weapon stock</h3>
          <ul className="grid grid-cols-2 gap-x-4 text-[13.5px]">
            {world.stock
              .filter((s) => s.base_id === b.id)
              .map((s) => (
                <li key={s.weapon_id} className="flex justify-between border-b border-line py-1.5">
                  <span className="text-muted">{s.weapon_id}</span>
                  <span className="num font-semibold">{s.qty}</span>
                </li>
              ))}
          </ul>
        </section>
      </>
    );
  } else {
    const z = world.zones.find((x) => x.id === d.id);
    if (!z) return null;
    const lvl = Math.max(0, ...world.threats.filter((t) => t.zone_id === z.id && t.start <= now && now < t.end).map((t) => t.level));
    const ms = world.missions.filter((m) => m.zone_id === z.id && m.status === "open");
    const restr = world.restrictions.filter((r) => r.zone_id === z.id);
    icon = <Crosshair size={20} />;
    title = z.name;
    sub = `Threat level now: ${["none", "low", "medium", "high"][lvl]}`;
    body = (
      <>
        <section>
          <h3 className="mb-1 text-[14px] font-semibold">Missions here</h3>
          <ul className="divide-y divide-line">
            {ms.map((m) => {
              const ss = sorties.filter((s) => s.mission_id === m.id);
              return (
                <li key={m.id} className="flex items-center gap-2 py-2.5 text-[14px]">
                  <PriorityTag p={m.priority} compact />
                  <span className="num font-semibold">{missionCode(m)}</span>
                  <span className="truncate text-dim">{m.name}</span>
                  <Pill tone={ss.length ? "info" : "warn"} className="ml-auto">
                    {ss.length ? STAGE_LABEL[stageOf(ss[0], now)] : "Not assigned"}
                  </Pill>
                </li>
              );
            })}
          </ul>
        </section>
        {restr.length > 0 && (
          <section>
            <h3 className="mb-1 text-[14px] font-semibold">Airspace restrictions</h3>
            <ul className="text-[13.5px] text-muted">
              {restr.map((r) => (
                <li key={r.id}>
                  {hhmm(r.start)}-{hhmm(r.end)}: {r.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-40" onMouseDown={() => close(null)}>
      <div className="absolute inset-0 bg-navy/15" />
      <aside
        role="dialog"
        aria-label={title}
        className="slide-in absolute inset-y-0 right-0 flex w-[440px] flex-col border-l border-line bg-white shadow-[var(--shadow-pop)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[18px] font-semibold">{title}</div>
            <div className="mt-0.5 text-[13.5px] text-muted">{sub}</div>
          </div>
          <button onClick={() => close(null)} className="h-9 w-9 rounded-lg text-dim hover:bg-primary-50 hover:text-text" aria-label="Close details" autoFocus>
            <X size={18} className="mx-auto" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{body}</div>
      </aside>
    </div>
  );
}
