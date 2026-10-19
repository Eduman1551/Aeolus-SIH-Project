"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx, secs } from "@/lib/format";
import { useStore } from "@/lib/store";

const SOLVE_OPS = /^(Generating|Replanning|Applying conditions|Re-solving)/;
const STEPS = ["Reading aircraft & crews", "Optimising", "Validating"];

type Done = { text: string; ok: boolean };

/**
 * While a plan is being made: three steps that tick off, then one line with the measured result.
 * Other actions (publishing, reading chat text) get a plain "working on it" card.
 * The result line never blocks clicks.
 */
export default function SolvingScreen() {
  const busy = useStore((s) => s.busy);
  const [, tick] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  const op = useRef<{ solve: boolean; before: string | null } | null>(null);

  useEffect(() => {
    if (busy) {
      op.current = { solve: SOLVE_OPS.test(busy.label), before: useStore.getState().plan?.last_result?.plan_id ?? null };
      setDone(null);
      const id = setInterval(() => tick((t) => t + 1), 100);
      return () => clearInterval(id);
    }
    // busy just ended: show the measured result if this was a solve that produced a new plan
    const was = op.current;
    op.current = null;
    if (!was?.solve) return;
    const p = useStore.getState().plan;
    const lr = p?.last_result;
    if (!lr || lr.plan_id === was.before) return;
    const violations = p?.proposal?.id === lr.plan_id ? p.proposal.validation.violations.length : 0;
    const head = lr.path === "cache hit" ? "Prepared answer served" : "Best plan found";
    setDone({ text: `${head} in ${secs(lr.total_ms)} · ${violations} violation${violations === 1 ? "" : "s"}`, ok: lr.publishable });
    const t = setTimeout(() => setDone(null), 2200);
    return () => clearTimeout(t);
  }, [busy]);

  if (done) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center" role="status">
        <div className={cx("fade-in flex items-center gap-2.5 rounded-2xl border bg-white px-5 py-3 text-[15px] font-semibold shadow-[var(--shadow-pop)]", done.ok ? "border-teal/30 text-teal" : "border-amber/40 text-amber")}>
          <Check size={18} />
          <span className="num text-navy">{done.text}</span>
        </div>
      </div>
    );
  }
  if (!busy) return null;
  const elapsed = (performance.now() - busy.startedAt) / 1000;
  if (elapsed < 0.2) return null;
  const solve = SOLVE_OPS.test(busy.label);
  // steps are the real phases of a solve; the API answers once all three are finished
  const active = elapsed < 0.15 ? 0 : 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-[2px]" role="alert" aria-busy="true">
      <div className="fade-in w-[380px] rounded-2xl border border-line bg-white px-7 py-6 shadow-[var(--shadow-pop)]">
        <div className="text-[16px] font-semibold text-text">{busy.label}</div>
        {solve ? (
          <ol className="mt-4 space-y-3">
            {STEPS.map((s, i) => {
              const state = i < active ? "done" : i === active ? "now" : "next";
              return (
                <li key={s} className="flex items-center gap-3 text-[14.5px]">
                  <span
                    className={cx(
                      "flex h-6 w-6 items-center justify-center rounded-full",
                      state === "done" ? "bg-teal text-white" : state === "now" ? "bg-primary-50 text-primary" : "bg-panel-2 text-dim",
                    )}
                  >
                    {state === "done" ? <Check size={14} /> : state === "now" ? <Loader2 size={14} className="spin" /> : <span className="text-[12px]">{i + 1}</span>}
                  </span>
                  <span className={state === "next" ? "text-dim" : "text-text"}>{s}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-[14.5px] text-muted">
            <Loader2 className="spin text-primary" size={20} /> Working on it
          </div>
        )}
        <div className="num mt-4 text-[13px] text-dim">{elapsed.toFixed(1)} s</div>
      </div>
    </div>
  );
}
