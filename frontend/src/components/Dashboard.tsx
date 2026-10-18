"use client";

import { ServerCrash } from "lucide-react";
import { useEffect } from "react";
import { api, API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { connectLive } from "@/lib/ws";
import EndPlanModal from "./EndPlanModal";
import Gantt from "./Gantt";
import KpiStrip from "./KpiStrip";
import MissionTable from "./MissionTable";
import RightPanel from "./RightPanel";
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
  useEffect(() => {
    const id = setInterval(() => {
      api.health().then((health) => useStore.setState({ health })).catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, []);

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
              <section aria-label="Timeline" className="min-h-0 flex-[1.75] overflow-hidden rounded-md border border-line bg-panel">
                <Gantt />
              </section>
              <section aria-label="Missions" className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-panel">
                <MissionTable />
              </section>
            </div>
            <aside aria-label="Planner tools" className="w-[400px] shrink-0 overflow-hidden rounded-md border border-line bg-panel 2xl:w-[460px]">
              <RightPanel />
            </aside>
          </main>
        </>
      )}
      <Toasts />
      <EndPlanModal />
    </div>
  );
}
