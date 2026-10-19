"use client";

import { CalendarRange, ClipboardCheck, Play } from "lucide-react";
import AllocationSankey from "@/components/AllocationSankey";
import Gantt, { GanttLegend } from "@/components/Gantt";
import MissionTable from "@/components/MissionTable";
import ResultBanner from "@/components/ResultBanner";
import { Button, ButtonLink, Card, Empty, NextStep, PageHeader, TipBox } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function PlanPage() {
  const plan = useStore((s) => s.plan);
  const world = useStore((s) => s.world);
  const busy = useStore((s) => s.busy);
  const generate = useStore((s) => s.generate);

  const noPlan = !plan || plan.status === "no_plan";
  const next = noPlan
    ? { href: "/data", label: "Look at the data", hint: "Generate a plan above first, or look at the data it will use." }
    : plan?.proposal
      ? { href: "/review", label: "Review and approve", hint: "A plan is waiting for your decision." }
      : { href: "/events", label: "Try an event", hint: "See how the plan adapts when something changes." };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Mission plan"
        description="Which aircraft and crew fly each mission, hour by hour."
        action={
          noPlan ? (
            <Button variant="primary" size="lg" icon={<Play size={17} />} onClick={generate} disabled={!!busy || !plan}>
              Generate plan
            </Button>
          ) : plan?.proposal ? (
            <ButtonLink href="/review" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Review proposed plan
            </ButtonLink>
          ) : undefined
        }
      />
      <TipBox
        id="plan"
        lines={[
          "Each row is an aircraft, each coloured bar a mission. Darker blue means higher priority.",
          "Click any bar to see its crew, weapons, plan strength and the reason for any change.",
        ]}
      />
      <ResultBanner />

      {noPlan && (
        <Card>
          <Empty icon={<CalendarRange size={22} />} title="No plan yet. Click Generate plan.">
            Aeolus will assign aircraft, crews and weapons to the {world?.missions.filter((m) => m.status === "open").length ?? 15} open missions in a fraction of a
            second. The timeline below already shows which aircraft are down and where the weather is bad.
          </Empty>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Gantt />
        <div className="border-t border-line px-5 py-3">
          <GanttLegend />
        </div>
      </Card>

      <AllocationSankey />

      <Card className="overflow-hidden">
        <MissionTable />
      </Card>

      <NextStep {...next} />
    </div>
  );
}
