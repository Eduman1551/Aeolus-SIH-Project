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
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
        <h2 className="label text-[13px]">Missions</h2>
        <span className="text-[12px] text-muted">
          {shown ? (
            <>
              <span className="text-teal">{rows.filter((r) => r.status === "assigned").length} assigned</span> ·{" "}
              <span className={unassigned ? "text-coral" : "text-muted"}>{unassigned} unassigned</span> of {rows.filter((r) => r.status !== "cancelled").length} open
            </>
          ) : (
            `${rows.length} missions in the tasking order`
          )}
        </span>
        <div className="ml-auto flex rounded-md border border-line-2 bg-bg p-0.5 text-[12px]" role="tablist" aria-label="Filter missions">
          {(
            [
              ["all", `All ${rows.length}`],
              ["unassigned", `Unassigned ${unassigned}`],
              ["changed", `Changed ${changed}`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cx("rounded px-2 py-0.5", filter === f ? "bg-panel-3 text-text" : "text-muted hover:text-text")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <Empty icon={<ListChecks size={22} />} title={filter === "changed" ? "No changes in this view" : "Nothing unassigned"}>
            {filter === "changed" ? "Changes show up here when a proposal differs from the active plan." : "Every open mission has aircraft and crew."}
          </Empty>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="text-left text-dim">
                {["Mission", "Type", "Zone", "Window", "Take-off", "Aircraft / crew", "Status", "Reason"].map((h) => (
                  <th key={h} className="label border-b border-line px-2 py-1.5 text-[11px] font-semibold first:pl-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ m, ss, status, reason, changes: ch, typeName }) => (
                <tr key={m.id} className={cx("align-top hover:bg-panel-2/60", ch.length > 0 && "bg-amber-dim/10")}>
                  <td className="border-b border-line/60 px-2 py-1.5 pl-3">
                    <div className="flex items-center gap-1.5">
                      <PriorityTag p={m.priority} compact />
                      <span className="mono font-medium">{m.id}</span>
                    </div>
                    <div className="mt-0.5 max-w-[150px] truncate text-[11px] text-dim" title={`${m.name} (${m.origin})`}>
                      {m.name}
                    </div>
                  </td>
                  <td className="border-b border-line/60 px-2 py-1.5 text-muted">
                    {typeName}
                    <div className="text-[11px] text-dim">{m.aircraft_required} aircraft</div>
                  </td>
                  <td className="mono border-b border-line/60 px-2 py-1.5">{m.zone_id}</td>
                  <td className="mono border-b border-line/60 px-2 py-1.5 text-muted">
                    {hhmm(m.window_start)}
                    {m.window_end !== m.window_start && `-${hhmm(m.window_end)}`}
                    <div className="text-[11px] text-dim">{m.duration_min} min</div>
                  </td>
                  <td className="mono border-b border-line/60 px-2 py-1.5">{ss[0] ? hhmm(ss[0].takeoff) : "-"}</td>
                  <td className="mono border-b border-line/60 px-2 py-1.5">
                    {ss.length ? ss.map((s) => <div key={s.aircraft_id}>{s.aircraft_id} <span className="text-dim">{s.crew_id}</span></div>) : <span className="text-dim">-</span>}
                  </td>
                  <td className="border-b border-line/60 px-2 py-1.5">
                    {status === "assigned" && <Pill tone="ok">Assigned</Pill>}
                    {status === "unassigned" && <Pill tone="bad">Unassigned</Pill>}
                    {status === "cancelled" && <Pill>Cancelled</Pill>}
                    {status === "open" && <Pill>Open</Pill>}
                    {ch.length > 0 && <Pill tone="warn" className="ml-1">Changed</Pill>}
                  </td>
                  <td className="border-b border-line/60 px-2 py-1.5 leading-[18px] text-muted">
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
