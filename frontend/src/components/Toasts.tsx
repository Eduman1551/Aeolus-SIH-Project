"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[70] flex w-[380px] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-[14px] shadow-[var(--shadow-pop)]",
            t.kind === "error" ? "border-coral/30" : t.kind === "success" ? "border-teal/30" : "border-primary-100",
          )}
        >
          {t.kind === "error" ? (
            <XCircle size={18} className="mt-0.5 shrink-0 text-coral" />
          ) : t.kind === "success" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-teal" />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-primary" />
          )}
          <span className="flex-1 leading-6 text-text">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="text-dim hover:text-text" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
