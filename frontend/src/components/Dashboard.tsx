"use client";

import { ServerCrash } from "lucide-react";
import { useEffect } from "react";
import { API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { connectLive } from "@/lib/ws";
import KpiStrip from "./KpiStrip";
import Toasts from "./Toasts";
import TopBar from "./TopBar";
import { Button } from "./ui";

function Unreachable() {
  const refreshAll = useStore((s) => s.refreshAll);
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md rounded-lg border border-line bg-panel p-6 text-center">
        <ServerCrash className="mx-auto text-coral" size={28} />
        <h2 className="mt-3 text-[15px] font-semibold">Cannot reach the Aeolus API</h2>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          The dashboard expects the backend at <span className="mono text-text">{API_URL}</span>. Start it with{" "}
          <span className="mono text-text">pnpm dev</span> (or <span className="mono text-text">pnpm dev:api</span>) and retry.
        </p>
        <Button className="mt-4" variant="primary" onClick={refreshAll}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const unreachable = useStore((s) => s.unreachable);
  const plan = useStore((s) => s.plan);

  useEffect(() => connectLive(), []);

  return (
    <div className="flex h-screen min-w-[1280px] flex-col">
      <TopBar />
      {unreachable && !plan ? (
        <Unreachable />
      ) : (
        <>
          <KpiStrip />
          <main className="flex min-h-0 flex-1 gap-2.5 p-3 pt-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="min-h-0 flex-[1.6] rounded-md border border-line bg-panel" />
              <div className="min-h-0 flex-1 rounded-md border border-line bg-panel" />
            </div>
            <aside className="w-[400px] shrink-0 rounded-md border border-line bg-panel 2xl:w-[460px]" />
          </main>
        </>
      )}
      <Toasts />
    </div>
  );
}
