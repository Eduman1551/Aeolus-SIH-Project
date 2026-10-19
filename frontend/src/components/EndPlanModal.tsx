"use client";

import { Database } from "lucide-react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/format";
import { KPI_COPY } from "@/lib/kpi";
import { useStore } from "@/lib/store";
import { Button, Modal } from "./ui";

export default function EndPlanModal() {
  const open = useStore((s) => s.endedOpen);
  const ended = useStore((s) => s.plan?.ended ?? null);
  const health = useStore((s) => s.health);
  const close = useStore((s) => s.closeEnded);
  const reset = useStore((s) => s.reset);
  const router = useRouter();

  if (!ended) return null;
  return (
    <Modal open={open} onClose={close} title="Plan ended, results saved" width={820}>
      <p className="text-[14.5px] leading-6 text-muted">{ended.summary}</p>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {ended.kpis.map((k) => (
          <div key={k.id} className="rounded-xl border border-line bg-panel-2 px-4 py-3">
            <div className="truncate text-[12.5px] font-medium text-dim">{KPI_COPY[k.id]?.name ?? k.label}</div>
            <div className={cx("num mt-0.5 text-[20px] font-semibold", k.value === null ? "text-dim" : "text-text")}>{k.display}</div>
            <div className="mt-0.5 text-[12px] leading-[17px] text-dim">{k.detail}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 text-[13.5px] text-muted">
        <Database size={16} className={health?.db.online ? "text-teal" : "text-coral"} />
        {health?.db.online ? "Saved to the results database." : "The database is offline, so these results are only kept on screen."}
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              close();
              router.push("/results");
            }}
          >
            View results page
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              close();
              reset();
              router.push("/");
            }}
          >
            Start a new scenario
          </Button>
        </div>
      </div>
    </Modal>
  );
}
