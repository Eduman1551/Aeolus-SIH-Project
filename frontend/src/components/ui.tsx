"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, PRIORITY_COLOR } from "@/lib/format";

type Variant = "primary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "outline",
  size = "md",
  loading,
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const styles: Record<Variant, string> = {
    primary: "bg-amber text-[#1a1306] hover:bg-[#f7c25a] border-amber font-semibold",
    ghost: "bg-transparent border-transparent text-muted hover:text-text hover:bg-panel-3",
    danger: "bg-coral-dim/60 border-coral/50 text-[#ffd9d4] hover:bg-coral-dim",
    outline: "bg-panel-2 border-line-2 text-text hover:border-dim hover:bg-panel-3",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md border transition-colors duration-150",
        "disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function PriorityTag({ p, compact }: { p: number; compact?: boolean }) {
  return (
    <span
      className={cx("mono inline-flex items-center rounded-sm font-semibold leading-none", compact ? "px-1 py-[2px] text-[10px]" : "px-1.5 py-[3px] text-[11px]")}
      style={{ color: PRIORITY_COLOR[p], background: `color-mix(in srgb, ${PRIORITY_COLOR[p]} 16%, transparent)` }}
    >
      P{p}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "bad" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "border-line-2 text-muted bg-panel-2",
    ok: "border-teal/40 text-teal bg-teal-dim/40",
    warn: "border-amber/40 text-amber bg-amber-dim/30",
    bad: "border-coral/45 text-coral bg-coral-dim/40",
    info: "border-p3/40 text-p3 bg-p3/10",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[11px] leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="label text-[12px] text-muted">{children}</h3>
      {right}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="text-dim">{icon}</div>
      <div className="text-[14px] font-medium text-text">{title}</div>
      {children && <div className="max-w-[300px] text-[12px] leading-5 text-muted">{children}</div>}
    </div>
  );
}

export const inputCls =
  "h-8 w-full rounded-md border border-line-2 bg-bg px-2 text-[13px] text-text placeholder:text-dim hover:border-dim focus:border-amber";
