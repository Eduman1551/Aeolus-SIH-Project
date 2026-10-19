"use client";

import { Pause, Play } from "lucide-react";
import { cx, hhmm } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Pill } from "./ui";

const STATUS: Record<string, { text: string; tone: "neutral" | "ok" | "warn" | "info" }> = {
  no_plan: { text: "No plan yet", tone: "neutral" },
  pending_approval: { text: "Waiting for approval", tone: "warn" },
  active: { text: "Plan active", tone: "ok" },
  ended: { text: "Plan ended", tone: "info" },
};

export default function TopBar() {
  const plan = useStore((s) => s.plan);
  const ws = useStore((s) => s.ws);
  const health = useStore((s) => s.health);
  const togglePause = useStore((s) => s.togglePause);

  const status = STATUS[plan?.status ?? "no_plan"];
  const live = ws === "open";
  const extras = health ? [health.db.online ? null : "results are not being saved", health.llm.configured ? null : "assistant uses the offline reader"].filter(Boolean) : [];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-white/90 px-8 backdrop-blur">
      <div className="flex items-center gap-2.5" data-tip={plan?.active ? "Scenario time runs faster than real time while a plan is active." : "The scenario clock starts when the first plan is approved."}>
        <span className="text-[13.5px] text-dim">Scenario time</span>
        <span className="num text-[17px] font-semibold text-text">{hhmm(plan?.now ?? 360)}</span>
        {plan?.active && (
          <button
            onClick={togglePause}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-primary-50 hover:text-primary-dark"
            aria-label={plan?.paused ? "Resume scenario clock" : "Pause scenario clock"}
          >
            {plan?.paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        )}
        {plan?.paused && <span className="text-[12.5px] text-dim">paused</span>}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="flex items-center gap-2 text-[13.5px] text-muted"
          data-tip={live ? `Connected to the Aeolus server${extras.length ? `. Note: ${extras.join(", ")}.` : "."}` : "Trying to reconnect to the Aeolus server"}
        >
          <span className={cx("h-2.5 w-2.5 rounded-full", live ? "live-dot bg-teal" : "bg-coral")} />
          {live ? "Connected" : ws === "connecting" ? "Connecting" : "Reconnecting"}
        </span>
        <span className="h-5 w-px bg-line" />
        <Pill tone={status.tone}>{status.text}</Pill>
        <span
          className="rounded-md border border-primary-100 bg-primary-50 px-2 py-0.5 text-[12px] font-semibold text-primary-dark"
          data-tip="Every aircraft, crew, base and number in Aeolus is made up for this demo."
        >
          Synthetic data
        </span>
      </div>
    </header>
  );
}
