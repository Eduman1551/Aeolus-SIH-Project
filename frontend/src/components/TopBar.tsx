"use client";

import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/format";
import { type WsState, useStore } from "@/lib/store";
import { Pill } from "./ui";

const WS_LABEL: Record<WsState, string> = {
  open: "Connected",
  connecting: "Connecting",
  waking: "Waking up the server",
  offline: "Offline",
};

const STATUS: Record<string, { text: string; tone: "neutral" | "ok" | "warn" | "info" }> = {
  no_plan: { text: "No plan yet", tone: "neutral" },
  pending_approval: { text: "Waiting for approval", tone: "warn" },
  active: { text: "Plan active", tone: "ok" },
  ended: { text: "Plan ended", tone: "info" },
};

export function zulu(min: number) {
  const m = Math.max(0, Math.floor(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}${String(m % 60).padStart(2, "0")}Z`;
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; text: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg border border-line bg-panel-2 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors", value === o.v ? "bg-white text-primary-dark shadow-sm" : "text-dim hover:text-text")}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

export default function TopBar() {
  const plan = useStore((s) => s.plan);
  const ws = useStore((s) => s.ws);
  const health = useStore((s) => s.health);
  const togglePause = useStore((s) => s.togglePause);
  const setSpeed = useStore((s) => s.setSpeed);
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const router = useRouter();

  const status = STATUS[plan?.status ?? "no_plan"];
  const live = ws === "open";
  const running = !!plan?.active && !plan.paused && plan.status !== "ended";
  const extras = health ? [health.db.online ? null : "results are not being saved", health.llm.configured ? null : "assistant uses the offline reader"].filter(Boolean) : [];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="flex h-7 items-center justify-center bg-navy text-[11.5px] font-semibold tracking-[0.18em] text-primary-100">
        SYNTHETIC EXERCISE DATA <span className="ml-3 hidden font-normal tracking-normal text-primary-200/80 lg:inline">· all units, places and numbers are fictional</span>
      </div>
      <div className="flex h-14 items-center gap-4 px-6">
        <div className="flex items-center gap-2.5" data-tip={plan?.active ? "Scenario time in Zulu (UTC). Missions move through their stages as the clock runs." : "The scenario clock starts when the first plan is approved."}>
          <span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-primary-dark">D1</span>
          <span className="num text-[19px] font-semibold tracking-tight text-navy" aria-label="Scenario time, Zulu">
            {zulu(plan?.now ?? 360)}
          </span>
          <span className={cx("h-2 w-2 rounded-full", running ? "live-dot bg-teal" : "bg-line-2")} aria-hidden />
        </div>
        <button
          onClick={togglePause}
          disabled={!plan?.active || plan.status === "ended"}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-primary-50 hover:text-primary-dark disabled:opacity-40"
          aria-label={plan?.paused ? "Play scenario clock" : "Pause scenario clock"}
          data-tip={!plan?.active ? "Approve a plan to start the clock" : plan.paused ? "Play" : "Pause"}
        >
          {plan?.paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <Segmented
          label="Clock speed"
          value={plan?.speed ?? 10}
          options={[
            { v: 1, text: "1x" },
            { v: 10, text: "10x" },
            { v: 60, text: "60x" },
          ]}
          onChange={(v) => setSpeed(v)}
        />

        <div className="ml-auto flex items-center gap-3">
          <Segmented
            label="View"
            value={role}
            options={[
              { v: "planner", text: "Planner" },
              { v: "commander", text: "Commander" },
            ]}
            onChange={(v) => {
              setRole(v);
              router.push(v === "commander" ? "/commander" : "/");
            }}
          />
          <span className="h-5 w-px bg-line" />
          <span
            className="flex items-center gap-2 text-[13.5px] text-muted"
            data-tip={
              live
                ? `Connected to the Aeolus server${extras.length ? `. Note: ${extras.join(", ")}.` : "."}`
                : ws === "offline"
                  ? "Cannot reach the Aeolus server. Use Retry in the banner below."
                  : ws === "waking"
                    ? "The server is waking up. This can take up to a minute."
                    : "Connecting to the Aeolus server"
            }
            role="status"
          >
            <span className={cx("h-2.5 w-2.5 rounded-full", live ? "live-dot bg-teal" : ws === "offline" ? "bg-coral" : "bg-amber")} />
            <span className="hidden xl:inline">{WS_LABEL[ws]}</span>
          </span>
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
      </div>
    </header>
  );
}
