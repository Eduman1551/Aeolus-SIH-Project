"use client";

import { Bot, Radio, Send, UserRound, Zap } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActivityEntry } from "@/lib/types";

const ICON: Record<string, React.ReactNode> = {
  planner: <UserRound size={14} />,
  system: <Bot size={14} />,
  event: <Zap size={14} />,
  publish: <Send size={14} />,
  info: <Radio size={14} />,
};

const NONE: ActivityEntry[] = [];

/** Who did what and when: planner decisions, injected events, plans published. */
export default function ActivityLog({ limit = 12 }: { limit?: number }) {
  const items = useStore((s) => s.plan?.activity) ?? NONE;
  if (!items.length) return <p className="py-4 text-[14px] text-dim">Nothing yet. Actions appear here as you plan.</p>;
  return (
    <ol className="space-y-0.5">
      {items.slice(0, limit).map((a, i) => (
        <li key={`${a.at}-${i}`} className="flex gap-3 py-2">
          <span
            className={cx(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              a.kind === "planner" ? "bg-primary text-white" : a.kind === "publish" ? "bg-teal-dim text-teal" : "bg-primary-50 text-primary",
            )}
          >
            {ICON[a.kind] ?? ICON.info}
          </span>
          <div className="min-w-0">
            <div className="text-[14px] leading-5 text-text">
              <b className="font-semibold">{a.actor}</b> {a.action}
            </div>
            <div className="truncate text-[12.5px] text-dim" title={a.detail}>
              <span className="num">{a.clock.replace(":", "")}Z</span> · {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} local
              {a.detail ? ` · ${a.detail}` : ""}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
