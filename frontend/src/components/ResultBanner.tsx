"use client";

import { ArrowRight, CircleAlert, Sparkles, X } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ButtonLink } from "./ui";

/** "Replanned in 1.8 s, 3 of 40 changed" with a button to review. */
export default function ResultBanner({ reviewHref = "/review" }: { reviewHref?: string }) {
  const badge = useStore((s) => s.resultBadge);
  const pending = useStore((s) => s.plan?.proposal?.id);
  if (!badge || Date.now() - badge.at > 10 * 60_000) return null;
  const ok = badge.tone === "ok";
  return (
    <div className={cx("fade-in flex items-center gap-4 rounded-2xl border px-5 py-4", ok ? "border-primary-100 bg-primary-50" : "border-amber/30 bg-amber-dim")}>
      {ok ? <Sparkles size={22} className="shrink-0 text-primary" /> : <CircleAlert size={22} className="shrink-0 text-amber" />}
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold text-text">{badge.text}</div>
        <div className="text-[13.5px] text-muted">
          {badge.path ? `Aeolus ${badge.path}. ` : ""}
          {ok ? "Every rule check passed." : "Some rules are broken, so this plan cannot be approved."}
        </div>
      </div>
      {pending && pending === badge.planId && (
        <ButtonLink href={reviewHref} variant="primary" icon={<ArrowRight size={16} />}>
          Review changes
        </ButtonLink>
      )}
      <button onClick={() => useStore.setState({ resultBadge: null })} className="h-8 w-8 rounded-lg text-dim hover:bg-white hover:text-text" aria-label="Dismiss">
        <X size={16} className="mx-auto" />
      </button>
    </div>
  );
}
