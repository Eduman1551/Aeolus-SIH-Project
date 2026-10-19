"use client";

import { Loader2, ServerCrash } from "lucide-react";
import { MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { connectLive, retryLive } from "@/lib/ws";
import EndPlanModal from "../EndPlanModal";
import EntityDrawer from "../EntityDrawer";
import ExerciseRunner from "../ExerciseRunner";
import SortieDrawer from "../SortieDrawer";
import Toasts from "../Toasts";
import TopBar from "../TopBar";
import { Button } from "../ui";
import Sidebar, { SIDEBAR_W } from "./Sidebar";
import SolvingScreen from "./SolvingScreen";

function hint(): string {
  if (!API_URL) return "No server address is set for this site (NEXT_PUBLIC_API_URL).";
  if (/localhost|127\.0\.0\.1/.test(API_URL)) return "Start it with pnpm dev, then retry.";
  return "It may be asleep or down. Retry in a moment.";
}

function Unreachable() {
  const refreshAll = useStore((s) => s.refreshAll);
  return (
    <div className="mx-8 mt-6 flex items-center gap-4 rounded-2xl border border-coral/30 bg-coral-dim px-5 py-4">
      <ServerCrash className="shrink-0 text-coral" size={22} />
      <div className="flex-1 text-[14.5px] text-text">
        <b>Cannot reach the Aeolus server</b>
        {API_URL && (
          <>
            {" "}at <span className="num">{API_URL}</span>
          </>
        )}
        . {hint()}
      </div>
      <Button
        variant="outline"
        onClick={() => {
          retryLive();
          refreshAll();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

function WakingUp() {
  return (
    <div className="mx-8 mt-6 flex items-center gap-4 rounded-2xl border border-amber/30 bg-amber-dim px-5 py-4" role="status">
      <Loader2 className="shrink-0 animate-spin text-amber motion-reduce:animate-none" size={22} />
      <div className="flex-1 text-[14.5px] text-text">
        <b>Waking up the server.</b> The free hosting sleeps when idle, so the first visit can take up to a minute.
      </div>
    </div>
  );
}

function readSavedCollapsed(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem("aeolus.shell.v1") || "{}").sidebarCollapsed;
  } catch {
    return false;
  }
}

export default function AppShell({ children }: { children: ReactNode }) {
  const unreachable = useStore((s) => s.unreachable);
  const ws = useStore((s) => s.ws);
  const hydrateLocal = useStore((s) => s.hydrateLocal);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebar = useStore((s) => s.setSidebar);
  // no width animation until the saved sidebar state is applied, so pages do not flicker on load
  const [ready, setReady] = useState(false);

  // auto-collapse below ~1280 px; going wide again restores the remembered choice
  useEffect(() => {
    hydrateLocal();
    let narrow: boolean | null = null;
    const check = () => {
      const now = window.innerWidth < 1280;
      if (now === narrow) return;
      narrow = now;
      setSidebar(now ? true : readSavedCollapsed(), false);
    };
    check();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", check);
    };
  }, [setSidebar, hydrateLocal]);

  useEffect(() => connectLive(), []);
  useEffect(() => {
    const id = setInterval(() => {
      api
        .health()
        .then((health) => {
          useStore.setState({ health });
          // the server is back (e.g. after waking up): reconnect the live feed
          if (useStore.getState().ws === "offline") retryLive();
        })
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen" data-shell data-ready={ready || undefined} style={{ ["--sidebar-w" as string]: `${collapsed ? SIDEBAR_W.closed : SIDEBAR_W.open}px` }}>
      <Sidebar />
      <div className="shell-anim pl-[var(--sidebar-w)] transition-[padding] duration-200 ease-out">
        <TopBar />
        {ws === "waking" ? <WakingUp /> : (unreachable || ws === "offline") && ws !== "connecting" && <Unreachable />}
        <main className="px-8 pb-12 pt-7">{children}</main>
      </div>
      <SortieDrawer />
      <EntityDrawer />
      <SolvingScreen />
      <EndPlanModal />
      <ExerciseRunner />
      <Toasts />
    </div>
    </MotionConfig>
  );
}
