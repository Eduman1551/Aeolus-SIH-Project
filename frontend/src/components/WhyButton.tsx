"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { shownPlan } from "@/lib/ops";
import { useStore } from "@/lib/store";

/** The plain reason a mission is unassigned or changed, from the deterministic explanations. */
export function useWhy(missionId: string): { title: string; text: string } | null {
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  const shown = shownPlan(plan, view);
  const u = shown?.unassigned.find((x) => x.mission_id === missionId);
  if (u) return { title: "Why is this not assigned?", text: u.reason };
  const showingProposal = !!plan?.proposal && shown?.id === plan.proposal.id;
  const ch = showingProposal ? plan!.proposal!.changes.find((c) => c.mission_id === missionId) : undefined;
  if (ch) return { title: "Why did this change?", text: ch.reason };
  return null;
}

/** Small "Why?" button with a popover. Renders nothing when there is nothing to explain. */
export default function WhyButton({ missionId, className }: { missionId: string; className?: string }) {
  const why = useWhy(missionId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!why) return null;
  return (
    <span ref={ref} className={cx("relative inline-flex", className)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={`${why.title} ${missionId}`}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-primary-100 bg-primary-50 px-2 text-[12.5px] font-semibold text-primary-dark hover:border-primary"
      >
        <HelpCircle size={13} /> Why?
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={why.title}
          className="fade-in absolute right-0 top-[calc(100%+6px)] z-50 block w-[320px] rounded-xl border border-line bg-white p-4 text-left shadow-[var(--shadow-pop)]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-primary-dark">{why.title}</span>
            <button onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded p-1 text-dim hover:text-text" aria-label="Close">
              <X size={14} />
            </button>
          </span>
          <span className="mt-1.5 block text-[13.5px] font-normal leading-6 text-text">{why.text}</span>
        </span>
      )}
    </span>
  );
}
