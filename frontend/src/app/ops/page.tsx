"use client";

import ActivityLog from "@/components/ActivityLog";
import FlightBoard from "@/components/FlightBoard";
import ResultBanner from "@/components/ResultBanner";
import TacticalMap from "@/components/TacticalMap";
import { Card, NextStep, PageHeader, TipBox } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function OpsPage() {
  const plan = useStore((s) => s.plan);
  return (
    <div className="mx-auto max-w-[1700px] space-y-6">
      <PageHeader title="Ops map" description="The live theatre: bases, targets, threats, weather and every flight on the clock." />
      <TipBox
        id="ops"
        lines={["Press play in the top bar to watch flights move. Darker blue routes are higher priority.", "Click an aircraft, base or zone for details. Hover a flight to highlight it everywhere."]}
      />
      <ResultBanner />
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden p-2">
          <TacticalMap className="h-[calc(100vh-300px)] min-h-[460px]" />
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Flights">
            <div className="px-5 pb-3 pt-1">
              <FlightBoard limit={8} />
            </div>
          </Card>
          <Card title="Activity log">
            <div className="max-h-[300px] overflow-y-auto px-5 pb-3 pt-1">
              <ActivityLog limit={20} />
            </div>
          </Card>
        </div>
      </div>
      <NextStep
        href={plan?.proposal ? "/review" : plan?.active ? "/events" : "/plan"}
        label={plan?.proposal ? "Review the changes" : plan?.active ? "Try an event" : "Generate a plan"}
        hint="The map follows the plan on screen: the proposed one while it waits for approval, otherwise the live one."
      />
    </div>
  );
}
