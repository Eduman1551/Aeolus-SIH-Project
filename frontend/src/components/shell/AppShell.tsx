"use client";

import { Loader2, ServerCrash } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { connectLive } from "@/lib/ws";
import EndPlanModal from "../EndPlanModal";
import SortieDrawer from "../SortieDrawer";
import Toasts from "../Toasts";
import TopBar from "../TopBar";
import { Button } from "../ui";
import Sidebar from "./Sidebar";

/** Friendly "working on it" screen with elapsed time. Hidden for very quick actions to avoid a flash. */
function SolvingScreen() {
  const busy = useStore((s) => s.busy);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [busy]);
  if (!busy) return null;
  const elapsed = (performance.now() - busy.startedAt) / 1000;
  if (elapsed < 0.25) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-[2px]" role="alert" aria-busy="true">
      <div className="fade-in flex items-center gap-4 rounded-2xl border border-line bg-white px-7 py-5 shadow-[var(--shadow-pop)]">
        <Loader2 className="spin text-primary" size={26} />
        <div>
          <div className="text-[16px] font-semibold text-text">{busy.label}...</div>
          <div className="num text-[14px] text-muted">Working on it, {elapsed.toFixed(1)} s</div>
        </div>
      </div>
    </div>
  );
}

function Unreachable() {
  const refreshAll = useStore((s) => s.refreshAll);
  return (
    <div className="mx-8 mt-6 flex items-center gap-4 rounded-2xl border border-coral/30 bg-coral-dim px-5 py-4">
      <ServerCrash className="shrink-0 text-coral" size={22} />
      <div className="flex-1 text-[14.5px] text-text">
        <b>Cannot reach the Aeolus server</b> at <span className="num">{API_URL}</span>. Start it with <code className="rounded bg-white px-1.5">pnpm dev</code>, then retry.
      </div>
      <Button variant="outline" onClick={refreshAll}>
        Retry
      </Button>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const unreachable = useStore((s) => s.unreachable);
  const hydrateLocal = useStore((s) => s.hydrateLocal);

  useEffect(() => {
    hydrateLocal();
    return connectLive();
  }, [hydrateLocal]);
  useEffect(() => {
    const id = setInterval(() => {
      api.health().then((health) => useStore.setState({ health })).catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-[244px]">
        <TopBar />
        {unreachable && <Unreachable />}
        <main className="px-8 pb-12 pt-7">{children}</main>
      </div>
      <SortieDrawer />
      <SolvingScreen />
      <EndPlanModal />
      <Toasts />
    </div>
  );
}
