"use client";

import { Rise } from "@/components/motion";
import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "@/components/KpiCard";
import { Button, Card, Details, Empty, Modal, NextStep, PageHeader, Skeleton, TipBox } from "@/components/ui";
import { api } from "@/lib/api";
import { secs } from "@/lib/format";
import { KPI_COPY } from "@/lib/kpi";
import { useStore } from "@/lib/store";
import type { Plan, World } from "@/lib/types";

const HIT = "#60a5fa";
const MISS = "#1e3a8a";

function covered(plan: Plan | null, world: World, prios: number[]) {
  const ms = world.missions.filter((m) => m.status === "open" && m.origin === "tasking order" && prios.includes(m.priority));
  const got = new Set(plan?.sorties.map((s) => s.mission_id));
  return { got: ms.filter((m) => got.has(m.id)).length, total: ms.length };
}

function Comparison() {
  const plan = useStore((s) => s.plan);
  const world = useStore((s) => s.world);
  if (!plan || !world) return null;
  const a = plan.initial;
  const g = plan.baseline;
  const hist = plan.kpi_history;
  if (!a || !g) {
    return (
      <Card title="Simple method vs Aeolus">
        <p className="px-6 pb-6 pt-3 text-[14.5px] text-muted">Generate a plan to see how Aeolus compares with a simple method on the same data.</p>
      </Card>
    );
  }
  const rows: { k: string; a: string; g: string; m: string }[] = [
    { k: "Missions covered", a: String(new Set(a.sorties.map((s) => s.mission_id)).size), g: String(new Set(g.sorties.map((s) => s.mission_id)).size), m: "-" },
    ...[
      ["Critical (P1) missions", [1]],
      ["P1 and P2 missions", [1, 2]],
    ].map(([k, p]) => {
      const x = covered(a, world, p as number[]);
      const y = covered(g, world, p as number[]);
      return { k: k as string, a: `${x.got} of ${x.total}`, g: `${y.got} of ${y.total}`, m: "-" };
    }),
    { k: "Flights planned", a: String(a.sorties.length), g: String(g.sorties.length), m: "-" },
    { k: "Time to plan", a: secs(a.solve_ms), g: secs(g.solve_ms), m: `${hist.manual_baseline_min} min (assumed)` },
  ];
  return (
    <Card title="Simple method vs Aeolus">
      <div className="px-6 pb-5 pt-3">
        <p className="text-[14px] text-muted">The first plan of the day, measured on the same data. The simple method grabs the first free aircraft and crew for each mission in priority order.</p>
        <table className="mt-3 w-full text-[14.5px]">
          <thead>
            <tr className="text-left text-[13px] text-dim">
              <th className="py-2 font-semibold" />
              <th className="py-2 font-semibold text-primary-dark">Aeolus</th>
              <th className="py-2 font-semibold">Simple method</th>
              <th className="py-2 font-semibold">Manual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-t border-line">
                <td className="py-2.5 text-muted">{r.k}</td>
                <td className="num py-2.5 font-semibold text-text">{r.a}</td>
                <td className="num py-2.5 text-muted">{r.g}</td>
                <td className="num py-2.5 text-dim">{r.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReplanChart() {
  const replans = useStore((s) => s.plan?.kpi_history.replans);
  const data = (replans ?? []).map((r, i) => ({ n: `#${i + 1}`, s: r.ms / 1000, hit: r.path === "cache hit" }));
  const hits = data.filter((d) => d.hit);
  const misses = data.filter((d) => !d.hit);
  const avg = (xs: { s: number }[]) => (xs.length ? xs.reduce((t, x) => t + x.s, 0) / xs.length : null);
  return (
    <Card title="Replan time per event">
      <div className="px-6 pb-5 pt-2">
        <div className="flex flex-wrap gap-5 text-[13.5px] text-muted">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded" style={{ background: HIT }} /> Prepared answer (cache hit)
            {avg(hits) !== null && <b className="num text-text">avg {avg(hits)!.toFixed(3)} s</b>}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded" style={{ background: MISS }} /> Solved fresh (cache miss)
            {avg(misses) !== null && <b className="num text-text">avg {avg(misses)!.toFixed(3)} s</b>}
          </span>
        </div>
        {data.length === 0 ? (
          <p className="py-10 text-center text-[14.5px] text-muted">No events yet. Try one on the Events page to see replan times here.</p>
        ) : (
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#e3eaf5" />
                <XAxis dataKey="n" tick={{ fill: "#5b6b8c", fontSize: 12 }} axisLine={{ stroke: "#c9d6ea" }} tickLine={false} />
                <YAxis tick={{ fill: "#5b6b8c", fontSize: 12 }} axisLine={false} tickLine={false} width={44} unit=" s" />
                <Tooltip
                  cursor={{ fill: "#eff6ff" }}
                  formatter={(v) => [`${Number(v).toFixed(3)} s`, "Replan time"]}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e3eaf5", fontSize: 13 }}
                />
                <Bar dataKey="s" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.hit ? HIT : MISS} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ResultsPage() {
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const health = useStore((s) => s.health);
  const endPlan = useStore((s) => s.endPlan);
  const markProgress = useStore((s) => s.markProgress);
  const [confirm, setConfirm] = useState(false);
  const [snapshots, setSnapshots] = useState<{ id: number; taken_at: string; reason: string; summary: string }[] | null>(null);

  useEffect(() => {
    if (plan?.active) markProgress("visitedResults");
  }, [plan?.active, markProgress]);
  useEffect(() => {
    api
      .kpiHistory()
      .then((r) => setSnapshots(r.snapshots))
      .catch(() => setSnapshots([]));
  }, [plan?.ended]);

  const canEnd = !!plan?.active && plan.status !== "ended";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Results"
        description="How fast and how well Aeolus is planning. Every number comes from this session."
        action={
          canEnd ? (
            <Button variant="primary" size="lg" icon={<Flag size={17} />} onClick={() => setConfirm(true)} disabled={!!busy}>
              End plan and save results
            </Button>
          ) : undefined
        }
      />
      <TipBox id="results" lines={["Hover the (i) next to a name to see what it measures.", "When you are done, end the plan to save these results."]} />

      <div className="grid grid-cols-4 gap-4">
        {plan
          ? plan.kpis.map((k, i) => (
              <Rise key={k.id} i={i}>
              <KpiCard k={k}>
                <div className="mt-3 border-t border-line pt-2.5 text-[13px] leading-5 text-dim">{KPI_COPY[k.id]?.line}</div>
              </KpiCard>
              </Rise>
            ))
          : Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[170px]" />)}
      </div>
      <p className="text-[13px] text-dim">Targets are our own suggestions, not official requirements. The manual planning time is an assumption.</p>

      <div className="grid grid-cols-2 gap-6">
        <Comparison />
        <ReplanChart />
      </div>

      <Card title="Saved results">
        <div className="px-6 pb-5 pt-2">
          {snapshots === null ? (
            <Skeleton className="h-16" />
          ) : snapshots.length === 0 ? (
            <Empty icon={<Flag size={20} />} title="Nothing saved yet">
              {health?.db.online === false ? "The results database is offline, so results stay on screen only." : "End a plan to save its results here."}
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {snapshots.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="text-[14.5px] text-text">{s.summary}</div>
                  <div className="text-[13px] text-dim">Saved {new Date(s.taken_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Details>
              <div className="space-y-1">
                {plan?.kpis.map((k) => (
                  <div key={k.id}>
                    {k.label}: {k.display} ({k.detail}){k.baseline ? `, baseline ${k.baseline}` : ""}
                  </div>
                ))}
              </div>
            </Details>
          </div>
        </div>
      </Card>

      <NextStep href="/guide" label="How to use" hint="Want to run the full demo again? The guide walks through it step by step." />

      <Modal open={confirm} onClose={() => setConfirm(false)} title="End the plan and save results?" width={480}>
        <p className="text-[14.5px] leading-6 text-muted">This closes the live plan and saves a snapshot of all eight results to the database. You can start a new scenario afterwards.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Flag size={16} />}
            onClick={async () => {
              setConfirm(false);
              await endPlan();
            }}
          >
            End plan and save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
