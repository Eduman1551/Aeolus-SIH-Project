"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[360px] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in pointer-events-auto flex items-start gap-2 rounded-md border bg-panel-2 px-3 py-2 text-[13px] shadow-lg shadow-black/40",
            t.kind === "error" ? "border-coral/50" : t.kind === "success" ? "border-teal/40" : "border-line-2",
          )}
        >
          {t.kind === "error" ? (
            <XCircle size={16} className="mt-px shrink-0 text-coral" />
          ) : t.kind === "success" ? (
            <CheckCircle2 size={16} className="mt-px shrink-0 text-teal" />
          ) : (
            <Info size={16} className="mt-px shrink-0 text-p3" />
          )}
          <span className="flex-1 leading-5">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="text-dim hover:text-text" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
