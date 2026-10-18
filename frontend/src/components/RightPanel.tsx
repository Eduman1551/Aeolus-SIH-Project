"use client";

import { Activity, GitCompareArrows, MessageSquareText, ShieldCheck } from "lucide-react";
import { cx } from "@/lib/format";
import { type Tab, useStore } from "@/lib/store";
import ChangesPanel from "./ChangesPanel";
import ChatPanel from "./ChatPanel";
import EventsPanel from "./EventsPanel";
import ValidationPanel from "./ValidationPanel";

export default function RightPanel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const plan = useStore((s) => s.plan);
  const prop = plan?.proposal;
  const rep = prop?.validation ?? plan?.active_validation;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    { id: "chat", label: "Chat", icon: <MessageSquareText size={14} /> },
    { id: "events", label: "Events", icon: <Activity size={14} /> },
    {
      id: "changes",
      label: "Changes",
      icon: <GitCompareArrows size={14} />,
      badge: prop ? <span className="mono rounded-full bg-amber px-1.5 text-[10px] font-semibold leading-4 text-[#1a1306]">{prop.trigger.kind === "initial" ? "new" : prop.changes.length}</span> : undefined,
    },
    {
      id: "validation",
      label: "Validation",
      icon: <ShieldCheck size={14} />,
      badge: rep ? <span className={cx("h-1.5 w-1.5 rounded-full", rep.ok ? "bg-teal" : "bg-coral")} aria-label={rep.ok ? "passing" : "failing"} /> : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b border-line px-1" role="tablist" aria-label="Planner tools">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "relative flex flex-1 items-center justify-center gap-1.5 px-1 text-[12.5px] transition-colors",
              tab === t.id ? "text-text" : "text-muted hover:text-text",
            )}
          >
            {t.icon}
            {t.label}
            {t.badge}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-amber" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" && <ChatPanel />}
        {tab === "events" && <EventsPanel />}
        {tab === "changes" && <ChangesPanel />}
        {tab === "validation" && <ValidationPanel />}
      </div>
    </div>
  );
}
