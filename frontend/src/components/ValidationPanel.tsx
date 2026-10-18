"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Empty, Pill, SectionLabel } from "./ui";

export default function ValidationPanel() {
  const plan = useStore((s) => s.plan);
  if (!plan) return null;
  const rep = plan.proposal?.validation ?? plan.active_validation;
  const which = plan.proposal ? `proposed plan ${plan.proposal.id}` : plan.active ? `active plan ${plan.active.id}, re-checked against the latest picture` : "";
  if (!rep) {
    return (
      <Empty icon={<ShieldCheck size={24} />} title="Nothing to validate yet">
        Every plan, from the solver or from the cache, is re-checked here rule by rule before it can be published.
      </Empty>
    );
  }
  const failed = rep.rules.filter((r) => !r.passed).length;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          {rep.ok ? (
            <Pill tone="ok">
              <Check size={11} /> All {rep.rules.length} rules pass
            </Pill>
          ) : (
            <Pill tone="bad">
              <X size={11} /> {failed} rule{failed === 1 ? "" : "s"} failing · {rep.violations.length} violations
            </Pill>
          )}
          <span className="text-[11.5px] text-muted">{rep.checked_sorties} sorties checked</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-[17px] text-dim">
          Showing the {which}. The validator is separate code that re-reads the raw data. It never uses the solver&apos;s model.
          {rep.committed_sorties > 0 && ` ${rep.committed_sorties} committed sorties (already airborne) are only checked for resource conflicts.`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col">
          {rep.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-b border-line/50 py-[5px] text-[12.5px]">
              <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", r.passed ? "bg-teal-dim text-teal" : "bg-coral-dim text-coral")}>
                {r.passed ? <Check size={11} /> : <X size={11} />}
              </span>
              <span className={r.passed ? "text-text" : "text-coral"}>{r.label}</span>
              <span className="mono ml-auto text-[11px] text-dim">{r.passed ? "pass" : `${r.count} fail`}</span>
            </li>
          ))}
        </ul>
        {rep.violations.length > 0 && (
          <div className="mt-3">
            <SectionLabel>Violations</SectionLabel>
            <ul className="mt-1.5 flex flex-col gap-1">
              {rep.violations.map((v, i) => (
                <li key={i} className="rounded-md border border-coral/30 bg-coral-dim/20 px-2 py-1.5 text-[12px] leading-[17px]">
                  <span className="mono mr-1.5 text-coral">{v.rule}</span>
                  {v.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
