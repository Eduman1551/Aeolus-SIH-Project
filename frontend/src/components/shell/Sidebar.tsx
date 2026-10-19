"use client";

import { BarChart3, BookOpen, CalendarRange, ClipboardCheck, Database, Home, MessageSquareText, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Modal } from "../ui";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/data", label: "Data and live feed", icon: Database },
  { href: "/plan", label: "Mission plan", icon: CalendarRange },
  { href: "/events", label: "Events", icon: Zap },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
  { href: "/review", label: "Review plan", icon: ClipboardCheck },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/guide", label: "How to use", icon: BookOpen },
];

function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
        <path d="M6 13c4.5-3.5 9.5-3.5 14 0s7 2.6 7.5.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M5.5 19.5c4.5-2.8 9-2.8 12.6 0s7.8 2.6 9.4 0" fill="none" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[18px] font-bold tracking-tight text-navy">Aeolus</div>
        <div className="text-[12px] text-dim">Air operations planner</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const pending = useStore((s) => !!s.plan?.proposal);
  const busy = useStore((s) => s.busy);
  const reset = useStore((s) => s.reset);
  const [confirm, setConfirm] = useState(false);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[244px] flex-col border-r border-line bg-white px-3 py-5">
      <Logo />
      <nav aria-label="Main" className="mt-7 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors",
                active ? "bg-primary-50 text-primary-dark" : "text-muted hover:bg-panel-2 hover:text-text",
              )}
            >
              <Icon size={19} className={active ? "text-primary" : "text-dim"} />
              <span className="flex-1">{label}</span>
              {href === "/review" && pending && (
                <span className="rounded-full bg-primary px-2 text-[11.5px] font-semibold leading-5 text-white" aria-label="a plan is waiting for approval">
                  1
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-1">
        <div className="rounded-xl bg-panel-2 px-3 py-3 text-[12.5px] leading-5 text-dim">
          All aircraft, crews, bases and numbers here are fictional.
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" icon={<RotateCcw size={15} />} onClick={() => setConfirm(true)} disabled={!!busy}>
          Reset scenario
        </Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset the scenario?" width={440}>
        <p className="text-[14.5px] leading-6 text-muted">
          This reloads the original synthetic data and clears the current plan, events and chat. Saved results in the database are kept.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirm(false);
              reset();
            }}
          >
            Reset scenario
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
