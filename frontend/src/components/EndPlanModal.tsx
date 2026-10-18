"use client";

import { Database, Flag, X } from "lucide-react";
import { useEffect } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

export default function EndPlanModal() {
  const open = useStore((s) => s.endedOpen);
  const ended = useStore((s) => s.plan?.ended ?? null);
  const health = useStore((s) => s.health);
  const close = useStore((s) => s.closeEnded);
  const reset = useStore((s) => s.reset);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !ended) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="fade-in w-[720px] max-w-[94vw] rounded-lg border border-line-2 bg-panel p-5 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3">
          <Flag className="mt-0.5 text-amber" size={18} />
          <div className="flex-1">
            <h2 id="end-title" className="label text-[16px]">
              Plan ended · KPI summary
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-muted">{ended.summary}</p>
          </div>
          <button onClick={close} className="text-dim hover:text-text" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {ended.kpis.map((k) => (
            <div
              key={k.id}
              className="rounded-md border border-line bg-panel-2/60 px-2.5 py-2"
              style={{ boxShadow: `inset 0 2px 0 ${k.good === true ? "var(--color-teal)" : k.good === false ? "var(--color-coral)" : "var(--color-line-2)"}` }}
            >
              <div className="label truncate text-[10.5px] text-muted">{k.label}</div>
              <div className={cx("num text-[18px] font-semibold", k.value === null && "text-dim")}>{k.display}</div>
              <div className="text-[10.5px] leading-[14px] text-dim">{k.detail}</div>
              <div className="mt-0.5 text-[10px] text-dim">target: {k.target}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <Database size={14} className={health?.db.online ? "text-teal" : "text-coral"} />
          {health?.db.online ? "Snapshot saved to PostgreSQL (kpi_snapshots table)." : "Database offline: snapshot kept in memory only."}
          <span className="text-dim">Targets are our own suggestions.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                close();
                reset();
              }}
            >
              Start a new scenario
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
