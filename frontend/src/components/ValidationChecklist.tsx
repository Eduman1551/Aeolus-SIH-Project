"use client";

import { Check, X } from "lucide-react";
import { cx } from "@/lib/format";
import type { ValidationReport } from "@/lib/types";
import { InfoTip, Pill } from "./ui";

/** Rule-by-rule pass/fail from the independent checker. */
export default function ValidationChecklist({ rep }: { rep: ValidationReport }) {
  const passed = rep.rules.filter((r) => r.passed).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[16px] font-semibold">Rule checks</h2>
        <InfoTip text="A separate checker re-reads the raw data and tests every rule. It does not trust the planner, so a broken rule always shows up here." />
        <Pill tone={rep.ok ? "ok" : "bad"}>
          {rep.ok ? <Check size={13} /> : <X size={13} />} {passed} of {rep.rules.length} passed
        </Pill>
        {rep.committed_sorties > 0 && (
          <span className="text-[13px] text-dim">{rep.committed_sorties} flights already in the air are only checked for clashes.</span>
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-0.5">
        {rep.rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-line py-2.5 text-[14px]">
            <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", r.passed ? "bg-teal-dim text-teal" : "bg-coral-dim text-coral")}>
              {r.passed ? <Check size={14} /> : <X size={14} />}
            </span>
            <span className={r.passed ? "text-text" : "font-medium text-coral"}>{r.label}</span>
            <span className="ml-auto text-[13px] text-dim">{r.passed ? "Pass" : `${r.count} problem${r.count === 1 ? "" : "s"}`}</span>
          </li>
        ))}
      </ul>
      {rep.violations.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rep.violations.map((v, i) => (
            <li key={i} className="rounded-xl border border-coral/25 bg-coral-dim px-4 py-2.5 text-[14px] text-text">
              {v.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
