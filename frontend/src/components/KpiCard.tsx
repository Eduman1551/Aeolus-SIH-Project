"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { cx } from "@/lib/format";
import { KPI_COPY } from "@/lib/kpi";
import type { Kpi } from "@/lib/types";
import { CountUp, useChangeFlash } from "./motion";
import { InfoTip } from "./ui";

export default function KpiCard({ k: raw, big, children }: { k: Kpi; big?: boolean; children?: React.ReactNode }) {
  const k = raw.display === "--" ? { ...raw, value: null, good: null } : raw;
  const copy = KPI_COPY[k.id] ?? { name: k.label, line: k.detail, tip: k.detail };
  const flash = useChangeFlash(k.id, k.value);
  return (
    <div className="card flex min-w-0 flex-col p-5">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[14px] font-medium text-muted">{copy.name}</span>
        <InfoTip text={`${copy.tip} Suggested target: ${k.target}.`} />
        {k.good !== null && (
          <span className="ml-auto" aria-label={k.good ? "meets the suggested target" : "misses the suggested target"}>
            {k.good ? <CheckCircle2 size={17} className="text-teal" /> : <CircleAlert size={17} className="text-amber" />}
          </span>
        )}
      </div>
      <div
        className={cx(
          "num -mx-1.5 mt-2 self-start rounded-lg px-1.5 font-semibold tracking-tight transition-colors duration-500",
          big ? "text-[34px]" : "text-[28px]",
          k.value === null ? "text-dim" : "text-navy",
          flash === "better" && "bg-teal-dim text-teal",
          flash === "worse" && "bg-coral-dim text-coral",
        )}
        aria-live="polite"
      >
        {k.value === null ? "Not yet" : <CountUp text={k.display} />}
      </div>
      <div className="mt-1 text-[13.5px] leading-5 text-muted">{k.value === null ? copy.line : k.delta ?? k.baseline ?? k.detail}</div>
      {children}
    </div>
  );
}
