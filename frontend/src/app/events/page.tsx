"use client";

import { Rise } from "@/components/motion";
import { CloudFog, Crosshair, History, PlaneLanding, ShieldAlert, Wrench, Zap } from "lucide-react";
import { useState } from "react";
import { EventForm, type EventKind } from "@/components/EventForms";
import ResultBanner from "@/components/ResultBanner";
import { Button, Card, Details, InfoTip, Modal, NextStep, PageHeader, Pill, TipBox } from "@/components/ui";
import { secs } from "@/lib/format";
import { useStore } from "@/lib/store";

const CARDS: { kind: EventKind; title: string; text: string; icon: React.ReactNode }[] = [
  { kind: "aircraft_down", title: "Aircraft down", text: "An aircraft breaks and cannot fly for the rest of the day.", icon: <PlaneLanding size={26} /> },
  { kind: "new_mission", title: "New priority mission", text: "An urgent mission is added to today's tasking.", icon: <Crosshair size={26} /> },
  { kind: "weather_closure", title: "Weather closure", text: "Bad weather closes a base or a target area for some hours.", icon: <CloudFog size={26} /> },
  { kind: "threat_zone", title: "New threat zone", text: "Intelligence reports a stronger threat over a zone.", icon: <ShieldAlert size={26} /> },
];

const TITLE: Record<EventKind, string> = {
  aircraft_down: "Aircraft down",
  new_mission: "New priority mission",
  weather_closure: "Weather closure",
  threat_zone: "New threat zone",
  risk_update: "Maintenance report",
};

export default function EventsPage() {
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const inject = useStore((s) => s.injectEvent);
  const [open, setOpen] = useState<EventKind | null>(null);

  const cache = plan?.cache;
  const ready = (cache?.entries ?? []).filter((e) => e.valid);
  const readyKinds = new Set(ready.map((e) => e.event.type));
  const events = plan?.events ?? [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader title="Events" description="Something changed? Tell Aeolus and it replans in seconds." />
      <TipBox
        id="events"
        lines={["Pick an event card and fill in the short form.", "Aeolus replans, then you review the changes before anything goes live."]}
      />
      <ResultBanner />

      {!plan?.active && (
        <div className="rounded-2xl border border-line bg-white px-5 py-4 text-[14.5px] text-muted shadow-[var(--shadow-card)]">
          Events are most useful on a live plan. Generate and approve a plan first, then come back here.
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {CARDS.map((c, i) => (
          <Rise key={c.kind} i={i} className="flex">
          <button
            onClick={() => setOpen(c.kind)}
            disabled={!!busy}
            className="card group flex w-full flex-col items-start p-6 text-left transition-shadow hover:border-primary-100 hover:shadow-[var(--shadow-pop)] disabled:opacity-60"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              {c.icon}
            </span>
            <span className="mt-4 text-[17px] font-semibold text-text">{c.title}</span>
            <span className="mt-1 text-[14px] leading-6 text-muted">{c.text}</span>
            <span className="mt-4 flex w-full items-center justify-between">
              <span className="text-[14px] font-medium text-primary">Open form</span>
              {readyKinds.has(c.kind) && (
                <Pill tone="info">
                  <Zap size={12} /> Answer ready
                </Pill>
              )}
            </span>
          </button>
          </Rise>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card
          title={
            <span className="flex items-center gap-1.5">
              Prepared in advance
              <InfoTip text="After each approval Aeolus pre-solves the likeliest problems, so these events get an answer almost instantly." />
            </span>
          }
          action={cache && cache.status === "building" ? <Pill>Preparing...</Pill> : undefined}
        >
          <div className="px-6 pb-5 pt-3">
            {!plan?.active ? (
              <p className="text-[14px] text-muted">Ready-made answers appear here after you approve a plan.</p>
            ) : ready.length === 0 ? (
              <p className="text-[14px] text-muted">
                {cache?.status === "building" ? "Preparing answers for the likeliest problems..." : "The picture changed since the last approval, so prepared answers are out of date. Approve the current plan to prepare new ones."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {ready.map((e) => (
                  <li key={e.signature} className="flex items-center gap-3 py-3">
                    <Zap size={17} className="shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] text-text">{e.label.replace(" (reported unserviceable)", "")}</div>
                      <div className="truncate text-[13px] text-dim">Why: {e.why}</div>
                    </div>
                    <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => inject({ type: e.event.type, params: e.event.params }, e.label)}>
                      Run
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <Button size="sm" variant="ghost" icon={<Wrench size={15} />} onClick={() => setOpen("risk_update")} disabled={!!busy}>
                Report maintenance data for an aircraft
              </Button>
            </div>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><History size={17} className="text-primary" /> Event history</span>}>
          <div className="px-6 pb-5 pt-3">
            {events.length === 0 ? (
              <p className="text-[14px] text-muted">No events yet. Pick a card above to try one.</p>
            ) : (
              <ul className="divide-y divide-line">
                {events.slice(0, 8).map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="num text-[13px] text-dim">{e.clock}</span>
                      <span className="text-[14.5px] text-text">{e.description}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] text-dim">
                      {e.classification.category} · {e.classification.affected.length} flights affected ·{" "}
                      {e.cache_hit ? "prepared answer" : "solved fresh"}
                      {e.replan_ms != null && ` in ${secs(e.replan_ms)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {events.length > 0 && (
              <div className="mt-3">
                <Details>
                  Each event is classified (category and severity), checked against the contingency cache using its signature and the current world
                  fingerprint, then either loaded from the cache or re-solved with a warm start and a stability penalty. The independent validator
                  checks the result every time.
                </Details>
              </div>
            )}
          </div>
        </Card>
      </div>

      <NextStep
        href={plan?.proposal ? "/review" : "/assistant"}
        label={plan?.proposal ? "Review the changes" : "Ask the assistant"}
        hint={plan?.proposal ? "A new plan is waiting for your decision." : "You can also describe changes in plain English."}
      />

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open ? TITLE[open] : ""}>
        {open && <EventForm kind={open} onDone={(ok) => (ok || !busy) && setOpen(null)} />}
      </Modal>
    </div>
  );
}
