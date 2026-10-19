"use client";

import { ArrowRight, ChevronDown, Info, Lightbulb, Loader2, X } from "lucide-react";
import Link from "next/link";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import { cx, PRIORITY_COLOR, PRIORITY_INK, STRENGTH } from "@/lib/format";
import { useStore } from "@/lib/store";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const BUTTON: Record<Variant, string> = {
  primary: "bg-primary text-white border-primary hover:bg-primary-dark hover:border-primary-dark shadow-sm",
  secondary: "bg-primary-50 text-primary-dark border-primary-100 hover:bg-primary-100",
  outline: "bg-white text-text border-line-2 hover:border-primary hover:text-primary-dark",
  ghost: "bg-transparent text-muted border-transparent hover:bg-primary-50 hover:text-primary-dark",
  danger: "bg-white text-coral border-coral/40 hover:bg-coral-dim",
};

export function Button({
  variant = "outline",
  size = "md",
  loading,
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15.5px]" : "h-10 px-4 text-[14px]",
        BUTTON[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "outline", size = "md", icon, children, className }: { href: string; variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-medium transition-colors duration-150",
        size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15.5px]" : "h-10 px-4 text-[14px]",
        BUTTON[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("card", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <h2 className="text-[16px] font-semibold text-text">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PriorityTag({ p, compact }: { p: number; compact?: boolean }) {
  return (
    <span
      className={cx("num inline-flex items-center rounded-md font-semibold leading-none", compact ? "px-1.5 py-[3px] text-[11px]" : "px-2 py-1 text-[12px]")}
      style={{ color: PRIORITY_INK[p], background: PRIORITY_COLOR[p] }}
    >
      P{p}
    </span>
  );
}

export function StrengthBadge({ level, small }: { level: string; small?: boolean }) {
  const s = STRENGTH[level] ?? STRENGTH.medium;
  return <Pill tone={s.tone} className={small ? "!px-1.5 text-[11px]" : ""}>{s.label}</Pill>;
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "bad" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "border-line text-muted bg-panel-2",
    ok: "border-teal/25 text-teal bg-teal-dim",
    warn: "border-amber/25 text-amber bg-amber-dim",
    bad: "border-coral/25 text-coral bg-coral-dim",
    info: "border-primary-100 text-primary-dark bg-primary-50",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[14px] font-semibold text-text">{children}</h3>
      {right}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary">{icon}</div>
      <div className="mt-1 text-[16px] font-semibold text-text">{title}</div>
      {children && <div className="max-w-[420px] text-[14px] leading-6 text-muted">{children}</div>}
    </div>
  );
}

/** small (i) with a tooltip, for KPI names and technical terms */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span tabIndex={0} data-tip={text} aria-label={text} className={cx("inline-flex cursor-help text-dim hover:text-primary", className)}>
      <Info size={14} />
    </span>
  );
}

export function Details({ summary = "Show details", children }: { summary?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-panel-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13.5px] font-medium text-muted hover:text-primary-dark"
      >
        {open ? summary.replace("Show", "Hide") : summary}
        <ChevronDown size={16} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="fade-in border-t border-line px-4 py-3 text-[13.5px] leading-6 text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-text">{title}</h1>
        <p className="mt-1.5 text-[15.5px] text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** dismissible "What to do here" box; remembered per page */
export function TipBox({ id, lines }: { id: string; lines: string[] }) {
  const dismissed = useStore((s) => s.tips[id]);
  const dismiss = useStore((s) => s.dismissTip);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || dismissed) return null;
  return (
    <div className="fade-in flex gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-5 py-4">
      <Lightbulb size={20} className="mt-0.5 shrink-0 text-primary" />
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-primary-dark">What to do here</div>
        <ul className="mt-1 space-y-0.5 text-[14px] leading-6 text-muted">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <button onClick={() => dismiss(id)} className="h-8 w-8 shrink-0 rounded-lg text-dim hover:bg-white hover:text-text" aria-label="Dismiss tip">
        <X size={16} className="mx-auto" />
      </button>
    </div>
  );
}

export function NextStep({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white px-6 py-4 shadow-[var(--shadow-card)]">
      <div className="text-[14px] text-muted">{hint ?? "When you are ready, move on to the next step."}</div>
      <ButtonLink href={href} variant="secondary" icon={<ArrowRight size={16} />}>
        Next: {label}
      </ButtonLink>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Modal({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fade-in max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-pop)]"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[19px] font-semibold text-text">{title}</h2>
          <button onClick={onClose} className="-mr-1 -mt-1 h-9 w-9 rounded-lg text-dim hover:bg-primary-50 hover:text-text" aria-label="Close">
            <X size={18} className="mx-auto" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13.5px] font-medium text-text">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-dim">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-11 w-full rounded-xl border border-line-2 bg-white px-3 text-[14.5px] text-text placeholder:text-dim hover:border-primary/60 focus:border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary";
