"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { hhmm, PRIORITY_LABEL, sortieKey, STRENGTH } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Details, PriorityTag, StrengthBadge } from "./ui";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2">
      <dt className="text-[13.5px] text-dim">{k}</dt>
      <dd className="text-[14.5px] text-text">{children}</dd>
    </div>
  );
}

export default function SortieDrawer() {
  const s = useStore((st) => st.selected);
  const close = useStore((st) => st.setSelected);
  const world = useStore((st) => st.world);
  const plan = useStore((st) => st.plan);
  const live = useStore((st) => st.live);

  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, close]);

  if (!s || !world) return null;
  const key = sortieKey(s);
  const m = world.missions.find((x) => x.id === s.mission_id);
  const a = world.aircraft.find((x) => x.id === s.aircraft_id);
  const c = world.crews.find((x) => x.id === s.crew_id);
  const type = world.aircraft_types.find((t) => t.id === a?.type_id);
  const mtype = world.mission_types.find((t) => t.id === m?.type_id);
  const svc = world.serviceability[s.aircraft_id];
  const frag = plan?.proposal?.fragility?.[key] ?? plan?.active_fragility?.[key];
  const change = plan?.proposal?.changes.find(
    (ch) => (ch.new && ch.mission_id === s.mission_id && ch.new.aircraft_id === s.aircraft_id) || (ch.old && ch.mission_id === s.mission_id && ch.old.aircraft_id === s.aircraft_id && !ch.new),
  );
  const tel = live.telemetry[s.aircraft_id] ?? a?.telemetry;
  const committed = s.takeoff < world.now;

  return (
    <div className="fixed inset-0 z-40" onMouseDown={() => close(null)}>
      <div className="absolute inset-0 bg-navy/15" />
      <aside
        role="dialog"
        aria-label={`Details for ${s.mission_id}`}
        className="slide-in absolute inset-y-0 right-0 flex w-[440px] flex-col border-l border-line bg-white shadow-[var(--shadow-pop)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {m && <PriorityTag p={m.priority} />}
              <span className="num text-[18px] font-semibold">{s.mission_id}</span>
            </div>
            <div className="mt-1 truncate text-[15px] text-muted">{m?.name}</div>
          </div>
          <button onClick={() => close(null)} className="h-9 w-9 rounded-lg text-dim hover:bg-primary-50 hover:text-text" aria-label="Close details" autoFocus>
            <X size={18} className="mx-auto" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {change && (
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
              <div className="text-[13px] font-semibold text-primary-dark">Why this changed</div>
              <p className="mt-1 text-[14px] leading-6 text-text">{change.reason}</p>
            </div>
          )}
          <dl className="divide-y divide-line">
            <Row k="Flight time">
              <span className="num">
                {hhmm(s.takeoff)} to {hhmm(s.landing)}
              </span>
              {committed && <span className="text-dim"> (already flying, locked)</span>}
            </Row>
            <Row k="Mission">
              {mtype?.name} over {m?.zone_id}
              <div className="text-[13px] text-dim">{m ? PRIORITY_LABEL[m.priority] : ""}</div>
            </Row>
            <Row k="Aircraft">
              <span className="num font-medium">{s.aircraft_id}</span> · {type?.name}, {a?.base_id}
              {svc !== undefined && <div className="text-[13px] text-dim">Predicted {Math.round(svc * 100)}% ready to fly</div>}
              {tel && <div className="text-[13px] text-dim">{tel.position}, fuel {tel.fuel_pct}%</div>}
            </Row>
            <Row k="Crew">
              <span className="num font-medium">{s.crew_id}</span> {c ? `"${c.callsign}"` : ""}
              {c && (
                <div className="text-[13px] text-dim">
                  On duty {hhmm(c.duty_start)} to {hhmm(c.duty_end)} at {c.base_id}
                </div>
              )}
            </Row>
            <Row k="Weapons">{Object.keys(s.loadout).length ? Object.entries(s.loadout).map(([w, q]) => `${q} × ${w}`).join(", ") : "None needed"}</Row>
          </dl>
          {frag && (
            <div className="rounded-xl border border-line px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">Plan strength</span>
                <StrengthBadge level={frag.level} />
              </div>
              <p className="mt-1.5 text-[13.5px] leading-6 text-muted">
                {STRENGTH[frag.level]?.label === "Strong"
                  ? "Several spare aircraft and crews could step in if this one fails."
                  : STRENGTH[frag.level]?.label === "Moderate"
                    ? "One spare could step in if this one fails."
                    : "Few or no spares could step in if this one fails."}{" "}
                {frag.backup_aircraft.length} spare aircraft, {frag.backup_crews.length} spare crews.
              </p>
            </div>
          )}
          <Details>
            <div className="space-y-1">
              {frag && (
                <>
                  <div>Fragility score: {frag.score} / 100 ({frag.note})</div>
                  <div>Spare aircraft: {frag.backup_aircraft.join(", ") || "none"}</div>
                  <div>Spare crews: {frag.backup_crews.join(", ") || "none"}</div>
                </>
              )}
              <div>Mission window: {m ? `${hhmm(m.window_start)} to ${hhmm(m.window_end)}` : "-"}, {m?.duration_min} min</div>
              {change?.facts.map((f) => (
                <div key={f}>Rule check: {f}</div>
              ))}
            </div>
          </Details>
        </div>
      </aside>
    </div>
  );
}
