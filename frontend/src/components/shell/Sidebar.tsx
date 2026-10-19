"use client";

import {
  BarChart3,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Database,
  Home,
  LayoutDashboard,
  Map,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Modal } from "../ui";

type Item = { href: string; label: string; icon: typeof Home; step?: number };

const PLANNER_NAV: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ops", label: "Ops map", icon: Map },
  { href: "/data", label: "Data and live feed", icon: Database },
  { href: "/plan", label: "Mission plan", icon: CalendarRange, step: 1 },
  { href: "/review", label: "Review plan", icon: ClipboardCheck, step: 2 },
  { href: "/events", label: "Events", icon: Zap, step: 3 },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText, step: 4 },
  { href: "/results", label: "Results", icon: BarChart3, step: 5 },
  { href: "/guide", label: "How to use", icon: BookOpen },
];

const COMMANDER_NAV: Item[] = [
  { href: "/commander", label: "Commander summary", icon: LayoutDashboard },
  { href: "/ops", label: "Ops map", icon: Map },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/guide", label: "How to use", icon: BookOpen },
];

export const SIDEBAR_W = { open: 248, closed: 76 };

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden px-2">
      <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
        <path d="M6 13c4.5-3.5 9.5-3.5 14 0s7 2.6 7.5.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M5.5 19.5c4.5-2.8 9-2.8 12.6 0s7.8 2.6 9.4 0" fill="none" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!collapsed && (
        <div className="whitespace-nowrap leading-tight">
          <div className="text-[18px] font-bold tracking-tight text-navy">Aeolus</div>
          <div className="text-[12px] text-dim">Air operations planner</div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const pending = useStore((s) => !!s.plan?.proposal);
  const busy = useStore((s) => s.busy);
  const reset = useStore((s) => s.reset);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebar = useStore((s) => s.setSidebar);
  const role = useStore((s) => s.role);
  const [confirm, setConfirm] = useState(false);
  const nav = role === "commander" ? COMMANDER_NAV : PLANNER_NAV;

  return (
    <aside
      className="shell-anim fixed inset-y-0 left-0 z-30 flex flex-col border-r border-line bg-white py-4 transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? SIDEBAR_W.closed : SIDEBAR_W.open }}
      aria-label="Sidebar"
    >
      <div className={cx("flex items-center", collapsed ? "flex-col gap-2 px-0" : "justify-between px-3")}>
        <Logo collapsed={collapsed} />
        <button
          onClick={() => setSidebar(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          data-tip-right={collapsed ? "Expand sidebar" : undefined}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-dim hover:bg-primary-50 hover:text-primary-dark"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav aria-label="Main" className={cx("flex flex-col gap-1 px-3", collapsed ? "mt-3" : "mt-6")}>
        {nav.map(({ href, label, icon: Icon, step }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          const badge = href === "/review" && pending;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              data-tip-right={collapsed ? (step ? `Step ${step}: ${label}` : label) : undefined}
              className={cx(
                "relative flex h-11 items-center rounded-xl text-[14.5px] font-medium transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-primary-50 text-primary-dark" : "text-muted hover:bg-panel-2 hover:text-text",
              )}
            >
              <Icon size={19} className={cx("shrink-0", active ? "text-primary" : "text-dim")} />
              {step && collapsed && (
                <span className="num absolute bottom-1 right-2.5 text-[10px] font-semibold text-dim">{step}</span>
              )}
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && step && !badge && <span className="num text-[11.5px] text-dim">{step}</span>}
              {badge && (
                <span
                  className={cx("rounded-full bg-primary text-[11px] font-semibold leading-5 text-white", collapsed ? "absolute right-2 top-1 h-5 w-5 text-center" : "px-2")}
                  aria-label="a plan is waiting for approval"
                >
                  1
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 px-3">
        {!collapsed && <div className="rounded-xl bg-panel-2 px-3 py-3 text-[12.5px] leading-5 text-dim">All aircraft, crews, bases and numbers here are fictional.</div>}
        <Button
          variant="ghost"
          size="sm"
          className={cx("w-full", collapsed ? "!px-0" : "justify-start")}
          icon={<RotateCcw size={15} />}
          onClick={() => setConfirm(true)}
          disabled={!!busy}
          aria-label="Reset scenario"
          data-tip-right={collapsed ? "Reset scenario" : undefined}
        >
          {!collapsed && "Reset scenario"}
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
