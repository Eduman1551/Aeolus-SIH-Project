"use client";

import { Database, Flag, Pause, Play, Play as Run, RotateCcw, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { hhmmss } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Pill } from "./ui";

const STATUS: Record<string, { text: string; tone: "neutral" | "ok" | "warn" | "bad" | "info" }> = {
  no_plan: { text: "No plan", tone: "neutral" },
  draft: { text: "Draft", tone: "neutral" },
  pending_approval: { text: "Pending approval", tone: "warn" },
  active: { text: "Active", tone: "ok" },
  ended: { text: "Ended", tone: "info" },
};

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--color-line-2)" />
        <path d="M5 13c5-4 11-4 16 0s8 3 10 1" fill="none" stroke="var(--color-amber)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M4 19c5-3 10-3 14 0s9 3 12 0" fill="none" stroke="var(--color-teal)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="leading-none">
        <div className="label text-[19px] tracking-[0.22em] text-text">AEOLUS</div>
        <div className="mt-0.5 text-[10px] tracking-wide text-dim">Air ops planning support</div>
      </div>
    </div>
  );
}

export default function TopBar() {
  const plan = useStore((s) => s.plan);
  const ws = useStore((s) => s.ws);
  const health = useStore((s) => s.health);
  const busy = useStore((s) => s.busy);
  const generate = useStore((s) => s.generate);
  const endPlan = useStore((s) => s.endPlan);
  const reset = useStore((s) => s.reset);
  const togglePause = useStore((s) => s.togglePause);
  const [confirmReset, setConfirmReset] = useState(false);

  const status = STATUS[plan?.status ?? "no_plan"];
  const now = plan?.now ?? 360;

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <Wordmark />

      <div className="ml-2 flex items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1">
        <span className="label text-[11px] text-dim">Scenario D1</span>
        <span className="mono text-[15px] font-medium text-text" aria-label="Scenario clock">
          {hhmmss(now)}
        </span>
        <button
          onClick={togglePause}
          className="ml-0.5 rounded p-0.5 text-muted hover:bg-panel-3 hover:text-text"
          aria-label={plan?.paused ? "Resume scenario clock" : "Pause scenario clock"}
          title={plan?.paused ? "Resume clock" : "Pause clock"}
        >
          {plan?.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>

      <span
        className="label rounded-sm border border-amber/60 px-2 py-[3px] text-[11px] tracking-[0.14em] text-amber"
        title="Every aircraft, crew, base and number is fictional"
      >
        Synthetic data
      </span>

      <div className="flex items-center gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5" title="Live link to the Aeolus API">
          {ws === "open" ? (
            <>
              <span className="live-dot h-2 w-2 rounded-full bg-teal" />
              <Wifi size={13} className="text-teal" /> Live
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-coral" />
              <WifiOff size={13} className="text-coral" /> {ws === "connecting" ? "Connecting" : "Reconnecting"}
            </>
          )}
        </span>
        {health && (
          <>
            <span className="flex items-center gap-1" title={health.db.online ? "Plan history and KPI logs go to PostgreSQL" : health.db.error ?? "offline"}>
              <Database size={13} className={health.db.online ? "text-teal" : "text-coral"} />
              {health.db.online ? "DB" : "DB offline"}
            </span>
            <span className="flex items-center gap-1" title={health.llm.configured ? `Groq ${health.llm.model}` : "Rule-based parser, works offline"}>
              <Sparkles size={13} className={health.llm.configured ? "text-amber" : "text-dim"} />
              {health.llm.configured ? "LLM" : "Offline parser"}
            </span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <span className="label text-[11px] text-dim">Plan</span>
        <Pill tone={status.tone} className="text-[12px]">
          {status.text}
        </Pill>
        {plan?.status === "no_plan" && (
          <Button variant="primary" icon={<Run size={14} />} onClick={generate} loading={busy?.label.startsWith("Generating")} disabled={!!busy}>
            Generate plan
          </Button>
        )}
        {plan?.active && plan.status !== "ended" && (
          <Button icon={<Flag size={14} />} onClick={endPlan} disabled={!!busy} title="Close the plan and log a KPI snapshot to PostgreSQL">
            End plan
          </Button>
        )}
        {confirmReset ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-muted">Reset scenario?</span>
            <Button size="sm" variant="danger" onClick={() => { setConfirmReset(false); reset(); }}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)} disabled={!!busy} title="Reload the seeded synthetic scenario">
            Reset
          </Button>
        )}
      </div>
    </header>
  );
}
