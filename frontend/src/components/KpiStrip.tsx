"use client";

import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Kpi } from "@/lib/types";

function Spark({ data, color }: { data: { v: number; c?: string }[]; color: string }) {
  if (data.length < 1) return null;
  return (
    <div className="h-[18px] w-[52px] shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
          <Bar dataKey="v" isAnimationActive={false} radius={[1, 1, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.c ?? color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tile({ k, spark }: { k: Kpi; spark?: React.ReactNode }) {
  const tone = k.good === true ? "var(--color-teal)" : k.good === false ? "var(--color-coral)" : "var(--color-line-2)";
  return (
    <div
      className="group relative flex min-w-0 flex-col justify-between rounded-md border border-line bg-panel px-3 py-2"
      style={{ boxShadow: `inset 0 2px 0 ${tone}` }}
      title={`${k.label}: ${k.detail}. Target (our suggestion): ${k.target}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label truncate text-[11px] text-muted">{k.label}</span>
        {spark}
      </div>
      <div className={cx("num mt-0.5 truncate text-[20px] font-semibold leading-6", k.value === null ? "text-dim" : "text-text")}>
        {k.display}
      </div>
      <div className="truncate text-[11px] leading-4 text-dim">
        {k.delta ?? k.baseline ?? k.detail}
      </div>
    </div>
  );
}

export default function KpiStrip() {
  const plan = useStore((s) => s.plan);
  if (!plan) {
    return (
      <div className="grid shrink-0 grid-cols-8 gap-2 px-3 pt-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[66px] animate-pulse rounded-md border border-line bg-panel" />
        ))}
      </div>
    );
  }
  const hist = plan.kpi_history;
  const replanSpark = hist.replans.map((r) => ({
    v: r.ms,
    c: r.path === "cache hit" ? "var(--color-teal)" : "var(--color-amber)",
  }));
  const stabSpark = hist.stabilities.map((s) => ({ v: Math.max(1, 100 - s), c: 100 - s < 15 ? "var(--color-teal)" : "var(--color-coral)" }));
  return (
    <section aria-label="Key performance indicators" className="shrink-0 px-3 pt-2.5">
      <div className="grid grid-cols-8 gap-2">
        {plan.kpis.map((k) => (
          <Tile
            key={k.id}
            k={k}
            spark={
              k.id === "replan_time" ? <Spark data={replanSpark} color="var(--color-amber)" /> : k.id === "stability" ? <Spark data={stabSpark} color="var(--color-teal)" /> : undefined
            }
          />
        ))}
      </div>
      <div className="mt-1 text-right text-[10px] text-dim">
        Targets are our own suggestions, not official requirements. Manual baseline {hist.manual_baseline_min} min is assumed.
      </div>
    </section>
  );
}
