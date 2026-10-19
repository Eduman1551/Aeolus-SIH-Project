"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx, PRIORITY_COLOR } from "@/lib/format";
import { shownPlan } from "@/lib/ops";
import { useStore } from "@/lib/store";
import { Rise } from "./motion";
import { Card, InfoTip, Skeleton } from "./ui";

const AXIS = { fill: "#5b6b8c", fontSize: 12 };
const TIP = { borderRadius: 10, border: "1px solid #e3eaf5", fontSize: 13 };
const HEAT = ["#f7faff", "#fde68a", "#fb923c", "#dc2626"];

function ChartCard({ title, tip, children, className }: { title: string; tip: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx("min-w-0", className)}>
      <div className="flex items-center gap-1.5 px-5 pt-4">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <InfoTip text={tip} />
      </div>
      <div className="px-3 pb-4 pt-2">{children}</div>
    </Card>
  );
}

function useOpsData() {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  return useMemo(() => {
    if (!world) return null;
    const now = plan?.now ?? world.now;
    const shown = shownPlan(plan, view);
    const sorties = shown?.sorties ?? [];

    // fleet readiness right now
    let ready = 0;
    let maint = 0;
    let down = 0;
    for (const a of world.aircraft) {
      const win = a.unavailable.find((w) => w.start <= now && now < w.end);
      if (a.status !== "serviceable") down++;
      else if (win && /inspection|maintenance|service/i.test(win.reason)) maint++;
      else if (win) down++;
      else ready++;
    }
    const readiness = [
      { name: "Ready", value: ready, color: "#2563eb" },
      { name: "Maintenance", value: maint, color: "#93c5fd" },
      { name: "Down", value: down, color: "#dc2626" },
    ];

    // crew duty hours used vs limit (busiest crews in the plan)
    const r = world.rules;
    const duty: Record<string, number> = {};
    for (const s of sorties) duty[s.crew_id] = (duty[s.crew_id] ?? 0) + (s.landing - s.takeoff + r.brief_min + r.debrief_min) / 60;
    const crews = Object.entries(duty)
      .map(([id, h]) => ({ id, used: Math.round(h * 10) / 10, limit: (world.crews.find((c) => c.id === id)?.max_duty_min ?? 600) / 60 }))
      .sort((a, b) => b.used - a.used)
      .slice(0, 12);

    // weapon stock per base vs planned use
    const used: Record<string, number> = {};
    for (const s of sorties) {
      const base = world.aircraft.find((a) => a.id === s.aircraft_id)?.base_id;
      for (const [w, q] of Object.entries(s.loadout)) used[`${base}|${w}`] = (used[`${base}|${w}`] ?? 0) + q;
    }
    const weapons = world.stock.map((st) => ({ name: `${st.weapon_id} ${st.base_id}`, Stock: st.qty, Planned: used[`${st.base_id}|${st.weapon_id}`] ?? 0 }));

    // coverage by priority
    const covered = new Set(sorties.map((s) => s.mission_id));
    const coverage = [1, 2, 3, 4].map((p) => {
      const ms = world.missions.filter((m) => m.status === "open" && m.priority === p);
      const a = ms.filter((m) => covered.has(m.id)).length;
      return { name: `P${p}`, Assigned: a, "Not assigned": shown ? ms.length - a : 0, Open: shown ? 0 : ms.length, p };
    });

    // threat level by zone and hour
    const hours = Array.from({ length: (r.horizon_end - r.horizon_start) / 60 }, (_, i) => r.horizon_start + i * 60);
    const heat = world.zones.map((z) => ({
      zone: z.id,
      name: z.name,
      cells: hours.map((h) => Math.max(0, ...world.threats.filter((t) => t.zone_id === z.id && t.start < h + 60 && h < t.end).map((t) => t.level))),
    }));
    return { readiness, crews, weapons, coverage, heat, hours, now, hasPlan: !!shown };
  }, [world, plan, view]);
}

export function ReadinessDonut() {
  const d = useOpsData();
  if (!d) return <Skeleton className="h-[220px]" />;
  const total = d.readiness.reduce((t, x) => t + x.value, 0);
  return (
    <ChartCard title="Fleet readiness" tip="Aircraft ready now, in scheduled maintenance, or down (fault or outage), at the current scenario time.">
      <div className="relative h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={d.readiness} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} isAnimationActive={false} stroke="none">
              {d.readiness.map((x) => (
                <Cell key={x.name} fill={x.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TIP} />
            <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 12.5 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 top-[70px] text-center">
          <div className="num text-[24px] font-semibold text-navy">{d.readiness[0].value}</div>
          <div className="text-[12px] text-dim">of {total} ready</div>
        </div>
      </div>
    </ChartCard>
  );
}

export function CoverageChart() {
  const d = useOpsData();
  if (!d) return <Skeleton className="h-[220px]" />;
  return (
    <ChartCard title="Mission coverage by priority" tip="Missions with aircraft and crew in the plan on screen, split by priority.">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d.coverage} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="#e3eaf5" />
            <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: "#c9d6ea" }} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TIP} cursor={{ fill: "#eff6ff" }} />
            <Bar dataKey="Assigned" stackId="a" isAnimationActive={false}>
              {d.coverage.map((c) => (
                <Cell key={c.name} fill={PRIORITY_COLOR[c.p]} />
              ))}
            </Bar>
            <Bar dataKey="Not assigned" stackId="a" fill="#fde68a" radius={[5, 5, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Open" stackId="a" fill="#e3eaf5" radius={[5, 5, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function CrewDutyChart() {
  const d = useOpsData();
  if (!d) return <Skeleton className="h-[220px]" />;
  return (
    <ChartCard title="Crew duty hours" tip="Planned duty (flight time plus briefings) for the busiest crews, against the 10-hour limit.">
      {d.crews.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-dim">No crews tasked yet.</p>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.crews} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#e3eaf5" />
              <XAxis dataKey="id" tick={{ ...AXIS, fontSize: 11 }} axisLine={{ stroke: "#c9d6ea" }} tickLine={false} interval={0} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} unit="h" domain={[0, 11]} />
              <Tooltip contentStyle={TIP} cursor={{ fill: "#eff6ff" }} formatter={(v) => [`${v} h`, "Planned duty"]} />
              <ReferenceLine y={10} stroke="#dc2626" strokeDasharray="5 4" label={{ value: "limit", position: "insideTopRight", fill: "#dc2626", fontSize: 11 }} />
              <Bar dataKey="used" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                {d.crews.map((c) => (
                  <Cell key={c.id} fill={c.used > 8.5 ? "#1e3a8a" : "#60a5fa"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export function WeaponsChart() {
  const d = useOpsData();
  if (!d) return <Skeleton className="h-[220px]" />;
  return (
    <ChartCard title="Weapon stock vs planned use" tip="Stock at each base and how much of it the plan on screen would load.">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d.weapons} margin={{ top: 6, right: 8, bottom: 0, left: -18 }} barGap={1}>
            <CartesianGrid vertical={false} stroke="#e3eaf5" />
            <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10.5 }} axisLine={{ stroke: "#c9d6ea" }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={44} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TIP} cursor={{ fill: "#eff6ff" }} />
            <Bar dataKey="Stock" fill="#bfdbfe" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Planned" fill="#1e3a8a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function ThreatHeatStrip() {
  const d = useOpsData();
  if (!d) return <Skeleton className="h-[220px]" />;
  const cols = d.hours.length;
  return (
    <ChartCard title="Threat level by zone over the day" tip="Highest reported threat level in each zone, hour by hour. Darker red is more dangerous.">
      <div className="px-2">
        <div className="grid items-center gap-y-1" style={{ gridTemplateColumns: `52px repeat(${cols}, minmax(0, 1fr))` }}>
          {d.heat.map((z) => (
            <div key={z.zone} className="contents">
              <span className="text-[12.5px] font-semibold text-muted" title={z.name}>
                {z.zone}
              </span>
              {z.cells.map((lvl, i) => {
                const isNow = d.now >= d.hours[i] && d.now < d.hours[i] + 60;
                return (
                  <span
                    key={i}
                    className={cx("h-6 border-r border-white", isNow && "ring-2 ring-primary ring-inset")}
                    style={{ background: HEAT[lvl] }}
                    title={`${z.zone} ${String(d.hours[i] / 60).padStart(2, "0")}:00: level ${lvl}`}
                  />
                );
              })}
            </div>
          ))}
          <span />
          {d.hours.map((h, i) => (
            <span key={h} className="num text-center text-[10.5px] text-dim">
              {i % 3 === 0 ? String(h / 60).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
          {["none", "low", "medium", "high"].map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              <span className="h-3 w-4 rounded-sm border border-line" style={{ background: HEAT[i] }} />
              {l}
            </span>
          ))}
          <span className="ml-auto">outlined = now</span>
        </div>
      </div>
    </ChartCard>
  );
}

/** The five ops overview charts. They follow the world picture and the plan on screen, so they update after every event and replan. */
export default function OpsCharts() {
  return (
    <div className="grid grid-cols-3 gap-5">
      <Rise i={0} className="min-w-0"><ReadinessDonut /></Rise>
      <Rise i={1} className="min-w-0"><CoverageChart /></Rise>
      <Rise i={2} className="min-w-0"><CrewDutyChart /></Rise>
      <Rise i={3} className="min-w-0"><WeaponsChart /></Rise>
      <Rise i={4} className="col-span-2 min-w-0"><ThreatHeatStrip /></Rise>
    </div>
  );
}
