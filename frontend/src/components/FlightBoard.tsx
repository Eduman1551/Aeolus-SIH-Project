"use client";

import { cx, hhmm } from "@/lib/format";
import { missionCode, shownPlan, STAGE_LABEL, stageOf } from "@/lib/ops";
import { useStore } from "@/lib/store";
import { PriorityTag } from "./ui";

const STAGE_TONE: Record<string, string> = {
  scheduled: "bg-panel-2 text-dim",
  taxi: "bg-amber-dim text-amber",
  airborne: "bg-primary-100 text-primary-dark",
  on_target: "bg-primary text-white",
  returning: "bg-primary-50 text-primary-dark",
  complete: "bg-teal-dim text-teal",
};

/** Departure-board style list of flights and their stage on the scenario clock. */
export default function FlightBoard({ limit = 10 }: { limit?: number }) {
  const plan = useStore((s) => s.plan);
  const world = useStore((s) => s.world);
  const view = useStore((s) => s.view);
  const hover = useStore((s) => s.hoverMission);
  const setHover = useStore((s) => s.setHoverMission);
  const openDrawer = useStore((s) => s.openDrawer);
  const shown = shownPlan(plan, view);
  const now = plan?.now ?? 360;
  if (!shown || !world) return <p className="py-4 text-[14px] text-dim">No plan yet. Generate one on the Mission plan page.</p>;
  const rows = shown.sorties
    .map((s) => ({ s, stage: stageOf(s, now), m: world.missions.find((m) => m.id === s.mission_id), a: world.aircraft.find((a) => a.id === s.aircraft_id) }))
    .filter((r) => r.stage !== "complete")
    .sort((x, y) => x.s.takeoff - y.s.takeoff)
    .slice(0, limit);
  if (!rows.length) return <p className="py-4 text-[14px] text-dim">All flights have landed.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map(({ s, stage, m, a }) => (
        <li key={`${s.mission_id}-${s.aircraft_id}`}>
          <button
            onClick={() => openDrawer({ kind: "aircraft", id: s.aircraft_id })}
            onMouseEnter={() => setHover(s.mission_id)}
            onMouseLeave={() => setHover(null)}
            className={cx("flex w-full items-center gap-2.5 py-2.5 text-left transition-colors", hover === s.mission_id && "bg-amber-dim/60")}
          >
            {m && <PriorityTag p={m.priority} compact />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-text">
                {a?.callsign} <span className="font-normal text-dim">{m ? missionCode(m) : s.mission_id}</span>
              </div>
              <div className="num text-[12.5px] text-dim">
                {hhmm(s.takeoff)}-{hhmm(s.landing)} · {m?.zone_id}
              </div>
            </div>
            <span className={cx("rounded-md px-2 py-0.5 text-[12px] font-semibold", STAGE_TONE[stage])}>{STAGE_LABEL[stage]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
