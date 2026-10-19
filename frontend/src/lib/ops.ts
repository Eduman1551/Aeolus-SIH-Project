// Ops-room helpers: mission stages and aircraft positions from the scenario clock.
// Pure presentation: stages are derived from the planned take-off/landing times only.
import type { Mission, Plan, PlanStatus, Sortie } from "./types";

export type Stage = "scheduled" | "taxi" | "airborne" | "on_target" | "returning" | "complete";

export const STAGE_LABEL: Record<Stage, string> = {
  scheduled: "Scheduled",
  taxi: "Taxi",
  airborne: "Airborne",
  on_target: "On target",
  returning: "Returning",
  complete: "Complete",
};

export const STAGE_ORDER: Stage[] = ["scheduled", "taxi", "airborne", "on_target", "returning", "complete"];

const TAXI_MIN = 15;

export function transitMin(s: Sortie) {
  return Math.max(20, Math.min(60, Math.round((s.landing - s.takeoff) * 0.25)));
}

export function stageOf(s: Sortie, now: number): Stage {
  const tr = transitMin(s);
  if (now < s.takeoff - TAXI_MIN) return "scheduled";
  if (now < s.takeoff) return "taxi";
  if (now < s.takeoff + tr) return "airborne";
  if (now < s.landing - tr) return "on_target";
  if (now < s.landing) return "returning";
  return "complete";
}

export interface Pos {
  x: number;
  y: number;
  heading: number; // degrees, 0 = east
  flying: boolean;
}

/** Where an aircraft is on its sortie at time `now` (theatre km grid). */
export function positionOf(s: Sortie, now: number, base: { x: number; y: number }, zone: { x: number; y: number }): Pos {
  const st = stageOf(s, now);
  const tr = transitMin(s);
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  const head = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (st === "airborne") return { ...lerp(base, zone, (now - s.takeoff) / tr), heading: head(base, zone), flying: true };
  if (st === "returning") return { ...lerp(zone, base, (now - (s.landing - tr)) / tr), heading: head(zone, base), flying: true };
  if (st === "on_target") {
    // racetrack orbit around the target area
    const a = ((now - s.takeoff - tr) / 12) * Math.PI;
    return { x: zone.x + Math.cos(a) * 22, y: zone.y + Math.sin(a) * 14, heading: (a * 180) / Math.PI + 90, flying: true };
  }
  return { x: base.x, y: base.y, heading: -90, flying: false };
}

const ABBR: Record<string, string> = { STRIKE: "STK", SEAD: "SEAD", CAP: "CAP", ISR: "ISR", AIRLIFT: "LIFT" };

export function missionCode(m: Pick<Mission, "id" | "type_id">) {
  return `${ABBR[m.type_id] ?? m.type_id}-${m.id.slice(1)}`;
}

/** The plan the planner is looking at: the proposal if one is waiting, else the live plan. */
export function shownPlan(p: PlanStatus | null, view: "proposal" | "active" = "proposal"): Plan | null {
  if (!p) return null;
  if (p.proposal && (view === "proposal" || !p.active)) return p.proposal.plan;
  return p.active ?? null;
}
