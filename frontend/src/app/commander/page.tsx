"use client";

import { Rise } from "@/components/motion";
import { AlertTriangle, CloudFog, Plane, ShieldAlert, Unlink } from "lucide-react";
import { useMemo } from "react";
import ActivityLog from "@/components/ActivityLog";
import KpiCard from "@/components/KpiCard";
import { CoverageChart, ReadinessDonut } from "@/components/OpsCharts";
import TacticalMap from "@/components/TacticalMap";
import { Card, NextStep, PageHeader, Pill, Skeleton } from "@/components/ui";
import { hhmm, STRENGTH } from "@/lib/format";
import { missionCode, shownPlan, stageOf } from "@/lib/ops";
import { useStore } from "@/lib/store";

type Risk = { key: string; level: "high" | "medium"; icon: React.ReactNode; text: string; sub: string; onClick?: () => void };

const COMMANDER_KPIS = ["priority_coverage", "violations", "stability", "replan_time"];

export default function CommanderPage() {
  const plan = useStore((s) => s.plan);
  const world = useStore((s) => s.world);
  const openDrawer = useStore((s) => s.openDrawer);
  const shown = shownPlan(plan, "active");
  const now = plan?.now ?? 360;

  const risks = useMemo<Risk[]>(() => {
    if (!world || !plan) return [];
    const out: Risk[] = [];
    const mission = (id: string) => world.missions.find((m) => m.id === id);
    for (const u of shown?.unassigned ?? []) {
      const m = mission(u.mission_id);
      if (m && m.priority <= 2)
        out.push({ key: `u${m.id}`, level: m.priority === 1 ? "high" : "medium", icon: <Unlink size={17} />, text: `P${m.priority} ${missionCode(m)} has no aircraft`, sub: u.reason, onClick: () => openDrawer({ kind: "zone", id: m.zone_id }) });
    }
    const frag = plan.active_fragility ?? {};
    for (const s of shown?.sorties ?? []) {
      const m = mission(s.mission_id);
      const f = frag[`${s.mission_id}/${s.aircraft_id}`];
      if (m && m.priority === 1 && f?.level === "high" && stageOf(s, now) !== "complete")
        out.push({ key: `f${s.mission_id}${s.aircraft_id}`, level: "medium", icon: <Plane size={17} />, text: `P1 ${missionCode(m)} has no spare aircraft or crew`, sub: `${STRENGTH.high.label} plan strength for ${world.aircraft.find((a) => a.id === s.aircraft_id)?.callsign}: ${f.note}`, onClick: () => openDrawer({ kind: "aircraft", id: s.aircraft_id }) });
    }
    const tasked = new Set((shown?.sorties ?? []).filter((s) => s.landing > now).map((s) => s.aircraft_id));
    for (const id of tasked) {
      const p = world.serviceability[id];
      const a = world.aircraft.find((x) => x.id === id);
      if (a && p !== undefined && p < 0.5)
        out.push({ key: `a${id}`, level: "medium", icon: <AlertTriangle size={17} />, text: `${a.callsign} is tasked with a ${Math.round((1 - p) * 100)}% fault risk`, sub: `${a.risk.faults_30d} faults in 30 days, ${a.risk.hours_since_maint} h since service`, onClick: () => openDrawer({ kind: "aircraft", id }) });
    }
    const zones = new Set((shown?.sorties ?? []).filter((s) => s.landing > now).map((s) => mission(s.mission_id)?.zone_id));
    for (const t of world.threats)
      if (t.level >= 3 && t.end > now && zones.has(t.zone_id))
        out.push({ key: `t${t.id}`, level: "high", icon: <ShieldAlert size={17} />, text: `High threat over ${t.zone_id}`, sub: `${t.note}, ${hhmm(Math.max(t.start, now))}-${hhmm(t.end)}`, onClick: () => openDrawer({ kind: "zone", id: t.zone_id }) });
    for (const w of world.weather)
      if (w.kind === "closure" && w.end > now)
        out.push({ key: `w${w.location_id}${w.start}`, level: "medium", icon: <CloudFog size={17} />, text: `${w.location_id} closed by weather`, sub: `${hhmm(w.start)}-${hhmm(w.end)}`, onClick: () => openDrawer({ kind: w.location_id.startsWith("B") ? "base" : "zone", id: w.location_id }) });
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
  }, [world, plan, shown, now, openDrawer]);

  const airborne = (shown?.sorties ?? []).filter((s) => ["airborne", "on_target", "returning"].includes(stageOf(s, now))).length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Commander summary" description="The picture at a glance: where the force is, how ready it is, what is covered and what could go wrong." />

      <div className="grid grid-cols-4 gap-4">
        {plan ? COMMANDER_KPIS.map((id) => plan.kpis.find((k) => k.id === id)).filter(Boolean).map((k, i) => <Rise key={k!.id} i={i}><KpiCard k={k!} /></Rise>) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[136px]" />)}
      </div>

      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-6">
        <Card
          title="Theatre"
          action={
            <span className="text-[13.5px] text-muted">
              {plan?.active ? `Live plan ${plan.active.id} · ${airborne} flights in the air` : "No live plan yet"}
            </span>
          }
        >
          <div className="p-3 pt-2">
            <TacticalMap compact className="aspect-[1100/820] w-full" />
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <ReadinessDonut />
          <CoverageChart />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-6">
        <Card title="Risks" action={<Pill tone={risks.some((r) => r.level === "high") ? "bad" : risks.length ? "warn" : "ok"}>{risks.length ? `${risks.length} to watch` : "Nothing flagged"}</Pill>}>
          <div className="px-6 pb-5 pt-2">
            {risks.length === 0 ? (
              <p className="py-6 text-[14.5px] text-muted">{plan?.active ? "No uncovered priority missions, weak P1 flights, risky aircraft, high threats or closures ahead." : "Risks appear here once a plan is live."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {risks.slice(0, 8).map((r) => (
                  <li key={r.key}>
                    <button onClick={r.onClick} className="flex w-full items-start gap-3 py-3 text-left hover:text-primary-dark">
                      <span className={r.level === "high" ? "mt-0.5 text-coral" : "mt-0.5 text-amber"}>{r.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium text-text">{r.text}</span>
                        <span className="block truncate text-[13px] text-dim" title={r.sub}>
                          {r.sub}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card title="Latest decisions">
          <div className="max-h-[360px] overflow-y-auto px-6 pb-4 pt-1">
            <ActivityLog limit={8} />
          </div>
        </Card>
      </div>

      <NextStep href="/ops" label="Open the ops map" hint="Switch back to the Planner view in the top bar to make changes." />
    </div>
  );
}
