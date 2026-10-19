"use client";

import { CloudFog, Plane, Radar, Radio, Wrench, Zap } from "lucide-react";
import { useMemo } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { EventRecord, FeedMsg } from "@/lib/types";

const NO_EVENTS: EventRecord[] = [];

const ICON: Record<string, React.ReactNode> = {
  telemetry: <Plane size={15} />,
  weather_obs: <CloudFog size={15} />,
  crew: <Radio size={15} />,
  logistics: <Wrench size={15} />,
  intel: <Radar size={15} />,
};

const SOURCE: Record<string, string> = {
  "fleet management system": "Fleet system",
  "met office": "Weather office",
  "crew rostering system": "Crew roster",
  "armament and logistics system": "Weapons store",
  "intelligence cell": "Intelligence",
};

/** Streaming messages from the source systems, plus injected events. */
export default function LiveFeed({ showEvents = true, limit = 60 }: { showEvents?: boolean; limit?: number }) {
  const feed = useStore((s) => s.feed);
  const events = useStore((s) => s.plan?.events) ?? NO_EVENTS;
  const ws = useStore((s) => s.ws);
  const items = useMemo(() => {
    const evs = showEvents ? events.map((e) => ({ key: `e${e.id}`, at: e.sim_time, event: e, msg: null as FeedMsg | null })) : [];
    const msgs = feed.map((m) => ({ key: `f${m.id}`, at: m.sim_time, event: null as EventRecord | null, msg: m }));
    return [...evs, ...msgs].sort((a, b) => b.at - a.at || (a.event ? -1 : 1)).slice(0, limit);
  }, [feed, events, showEvents, limit]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
        <h2 className="text-[16px] font-semibold">Live feed</h2>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <span className={cx("h-2 w-2 rounded-full", ws === "open" ? "live-dot bg-teal" : "bg-coral")} />
          {ws === "open" ? "Updating live" : "Paused"}
        </span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" aria-live="polite">
        {items.length === 0 && <li className="py-8 text-center text-[14px] text-dim">Waiting for the first message...</li>}
        {items.map((it) =>
          it.event ? (
            <li key={it.key} className="fade-in my-2 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12.5px] text-primary-dark">
                <Zap size={14} />
                <span className="num font-semibold">{it.event.clock}</span>
                <span className="font-semibold">{it.event.classification.category}</span>
              </div>
              <div className="mt-0.5 text-[14px] text-text">{it.event.description}</div>
              <div className="text-[12.5px] text-dim">{it.event.cache_hit ? "Answered from a prepared plan" : "Solved fresh"}</div>
            </li>
          ) : (
            <li key={it.key} className="fade-in flex items-start gap-3 border-b border-line py-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-primary">{ICON[it.msg!.kind] ?? <Radio size={15} />}</span>
              <div className="min-w-0">
                <div className="text-[14px] leading-5 text-text">{it.msg!.text}</div>
                <div className="text-[12.5px] text-dim">
                  <span className="num">{it.msg!.clock}</span> · {SOURCE[it.msg!.source] ?? it.msg!.source}
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
