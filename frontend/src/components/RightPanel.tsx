"use client";

import { Activity, MessageSquareText } from "lucide-react";
import { cx } from "@/lib/format";
import { type Tab, useStore } from "@/lib/store";
import ChatPanel from "./ChatPanel";
import EventsPanel from "./EventsPanel";

export default function RightPanel() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    { id: "chat", label: "Chat", icon: <MessageSquareText size={14} /> },
    { id: "events", label: "Events", icon: <Activity size={14} /> },
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
      </div>
    </div>
  );
}
