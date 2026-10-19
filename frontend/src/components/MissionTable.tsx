"use client";

import { ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { cx, hhmm } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Change, Sortie } from "@/lib/types";
import { Empty, Pill, PriorityTag } from "./ui";

type Filter = "all" | "unassigned" | "changed";

export default function MissionTable() {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  const [filter, setFilter] = useState<Filter>("all");
  const select = useStore((s) => s.setSelected);

  const proposal = plan?.proposal ?? null;
  const showProposal = !!proposal && (view === "proposal" || !plan?.active);
  const shown = showProposal ? proposal!.plan : plan?.active ?? null;
  const changes = showProposal ? proposal!.changes : [];

  const rows = useMemo(() => {
    if (!world) return [];
    const byMission: Record<string, Sortie[]> = {};
    for (const s of shown?.sorties ?? []) (byMission[s.mission_id] ||= []).push(s);
    const reasons = Object.fromEntries((shown?.unassigned ?? []).map((u) => [u.mission_id, u.reason]));
    const changeBy: Record<string, Change[]> = {};
    for (const c of changes) (changeBy[c.mission_id] ||= []).push(c);
    const types = Object.fromEntries(world.mission_types.map((t) => [t.id, t.name]));
    return world.missions
      .map((m) => {
        const ss = byMission[m.id] ?? [];
        const status = m.status === "cancelled" ? "cancelled" : !shown ? "open" : ss.length ? "assigned" : "unassigned";
        return { m, ss, status, reason: reasons[m.id] ?? "", changes: changeBy[m.id] ?? [], typeName: types[m.type_id] ?? m.type_id };
      })
      .sort((a, b) => a.m.priority - b.m.priority || a.m.window_start - b.m.window_start || a.m.id.localeCompare(b.m.id));
  }, [world, shown, changes]);

  if (!world) return null;
  const unassigned = rows.filter((r) => r.status === "unassigned").length;
  const changed = rows.filter((r) => r.changes.length).length;
  const visible = rows.filter((r) => (filter === "unassigned" ? r.status === "unassigned" : filter === "changed" ? r.changes.length > 0 : true));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="text-[16px] font-semibold">Missions</h2>
        <span className="text-[14px] text-muted">
          {shown ? (
            <>
              {rows.filter((r) => r.status === "assigned").length} assigned,{" "}
              <span className={unassigned ? "font-medium text-amber" : ""}>{unassigned} not assigned</span>, out of {rows.filter((r) => r.status !== "cancelled").length} open
            </>
          ) : (
            `${rows.length} missions in today's tasking`
          )}
        </span>
        <div className="ml-auto flex rounded-xl border border-line bg-panel-2 p-1 text-[13.5px]" role="tablist" aria-label="Filter missions">
          {(
            [
              ["all", `All ${rows.length}`],
              ["unassigned", `Not assigned ${unassigned}`],
              ["changed", `Changed ${changed}`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cx("rounded-lg px-3 py-1 font-medium", filter === f ? "bg-white text-primary-dark shadow-sm" : "text-muted hover:text-text")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        {visible.length === 0 ? (
          <Empty icon={<ListChecks size={22} />} title={filter === "changed" ? "No changes to show" : "Every mission is assigned"}>
            {filter === "changed" ? "Changed missions appear here when a proposed plan differs from the live one." : "All open missions have aircraft and crew."}
          </Empty>
        ) : (
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="text-left text-[13px] text-dim">
                {["Mission", "Type", "Zone", "Window", "Take-off", "Aircraft and crew", "Status", "Reason"].map((h) => (
                  <th key={h} className="border-y border-line bg-panel-2 px-3 py-2.5 font-semibold first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ m, ss, status, reason, changes: ch, typeName }) => (
                <tr key={m.id} className={cx("align-top hover:bg-panel-2", ch.length > 0 && "bg-primary-50/50")}>
                  <td className="border-b border-line px-3 py-3 pl-6">
                    <div className="flex items-center gap-2">
                      <PriorityTag p={m.priority} compact />
                      <span className="num font-semibold">{m.id}</span>
                    </div>
                    <div className="mt-1 max-w-[180px] truncate text-[13px] text-dim" title={`${m.name} (${m.origin})`}>
                      {m.name}
                    </div>
                  </td>
                  <td className="border-b border-line px-3 py-3 text-muted">
                    {typeName}
                    <div className="text-[13px] text-dim">{m.aircraft_required} aircraft</div>
                  </td>
                  <td className="num border-b border-line px-3 py-3">{m.zone_id}</td>
                  <td className="num border-b border-line px-3 py-3 text-muted">
                    {hhmm(m.window_start)}
                    {m.window_end !== m.window_start && ` to ${hhmm(m.window_end)}`}
                    <div className="text-[13px] text-dim">{m.duration_min} min</div>
                  </td>
                  <td className="num border-b border-line px-3 py-3">{ss[0] ? hhmm(ss[0].takeoff) : "-"}</td>
                  <td className="num border-b border-line px-3 py-3">
                    {ss.length ? (
                      ss.map((s) => (
                        <button key={s.aircraft_id} onClick={() => select(s)} className="block rounded text-left hover:text-primary hover:underline">
                          {s.aircraft_id} <span className="text-dim">{s.crew_id}</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-dim">-</span>
                    )}
                  </td>
                  <td className="border-b border-line px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {status === "assigned" && <Pill tone="info">Assigned</Pill>}
                      {status === "unassigned" && <Pill tone="warn">Not assigned</Pill>}
                      {status === "cancelled" && <Pill>Cancelled</Pill>}
                      {status === "open" && <Pill>Waiting for plan</Pill>}
                      {ch.length > 0 && <Pill tone="neutral">Changed</Pill>}
                    </div>
                  </td>
                  <td className="max-w-[380px] border-b border-line px-3 py-3 pr-6 text-[13.5px] leading-6 text-muted">
                    {status === "unassigned" ? reason : ch.length ? ch[0].reason : m.origin !== "tasking order" ? `Added via ${m.origin}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
