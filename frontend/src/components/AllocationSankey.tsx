"use client";

import { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { PRIORITY_COLOR } from "@/lib/format";
import { missionCode, shownPlan } from "@/lib/ops";
import { useStore } from "@/lib/store";
import { Card, InfoTip, PriorityTag } from "./ui";
import WhyButton from "./WhyButton";

type N = { name: string; kind: "base" | "type" | "prio"; key: string };

/** Where the flying goes: bases -> aircraft types -> missions by priority. Unassigned missions are listed beside it. */
export default function AllocationSankey() {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  const hover = useStore((s) => s.hoverMission);
  const setHover = useStore((s) => s.setHoverMission);
  const shown = shownPlan(plan, view);

  const data = useMemo(() => {
    if (!world || !shown || !shown.sorties.length) return null;
    const types = Object.fromEntries(world.aircraft_types.map((t) => [t.id, t.name]));
    const nodes: N[] = [];
    const idx: Record<string, number> = {};
    const node = (key: string, name: string, kind: N["kind"]) => {
      if (idx[key] === undefined) {
        idx[key] = nodes.length;
        nodes.push({ key, name, kind });
      }
      return idx[key];
    };
    const counts: Record<string, number> = {};
    const paths: Record<string, Set<string>> = {}; // link key -> missions on it
    for (const b of world.bases) node(`b:${b.id}`, b.name.replace(/^Base \d /, ""), "base");
    for (const s of shown.sorties) {
      const a = world.aircraft.find((x) => x.id === s.aircraft_id);
      const m = world.missions.find((x) => x.id === s.mission_id);
      if (!a || !m) continue;
      const b = node(`b:${a.base_id}`, a.base_id, "base");
      const t = node(`t:${a.type_id}`, types[a.type_id], "type");
      const p = node(`p:${m.priority}`, `P${m.priority} missions`, "prio");
      for (const [x, y] of [
        [b, t],
        [t, p],
      ]) {
        const k = `${x}-${y}`;
        counts[k] = (counts[k] ?? 0) + 1;
        (paths[k] ||= new Set()).add(m.id);
      }
    }
    const links = Object.entries(counts).map(([k, value]) => {
      const [source, target] = k.split("-").map(Number);
      return { source, target, value, missions: [...paths[k]] };
    });
    return { nodes, links };
  }, [world, shown]);

  const unassigned = (shown?.unassigned ?? []).map((u) => ({ u, m: world?.missions.find((m) => m.id === u.mission_id) })).filter((x) => x.m);

  return (
    <Card>
      <div className="flex items-center gap-1.5 px-6 pt-5">
        <h2 className="text-[16px] font-semibold">Where the flying goes</h2>
        <InfoTip text="Each band is a number of flights: from a base, by an aircraft type, to missions of each priority. Hover a mission anywhere to see its path here." />
      </div>
      {!data ? (
        <p className="px-6 py-10 text-[14.5px] text-muted">Generate a plan to see how flights are allocated.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6 px-6 pb-5 pt-3">
          <div className="h-[300px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={data}
                nodePadding={22}
                nodeWidth={14}
                margin={{ top: 8, right: 120, bottom: 8, left: 8 }}
                iterations={32}
                node={(p) => {
                  const n = p.payload as unknown as N & { value: number };
                  const fill = n.kind === "prio" ? PRIORITY_COLOR[Number(n.key.slice(2))] : n.kind === "base" ? "#1d4ed8" : "#60a5fa";
                  return (
                    <g>
                      <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={3} fill={fill} />
                      <text x={p.x + p.width + 8} y={p.y + p.height / 2} dy={4} fontSize={13} fill="#0b1f44" fontWeight={600}>
                        {n.name}
                        <tspan fill="#5b6b8c" fontWeight={400}> {n.value}</tspan>
                      </text>
                    </g>
                  );
                }}
                link={(p) => {
                  const l = p.payload as unknown as { target: N; missions?: string[] };
                  const t = l.target;
                  const lit = hover ? (l.missions ?? []).includes(hover) : false;
                  const color = t.kind === "prio" ? PRIORITY_COLOR[Number(t.key.slice(2))] : "#93c5fd";
                  return (
                    <path
                      d={`M${p.sourceX},${p.sourceY} C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`}
                      fill="none"
                      stroke={lit ? "#f59e0b" : color}
                      strokeWidth={Math.max(2, p.linkWidth)}
                      strokeOpacity={hover ? (lit ? 0.85 : 0.12) : 0.38}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                }}
              >
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e3eaf5", fontSize: 13 }} />
              </Sankey>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold">Not assigned ({unassigned.length})</h3>
            {unassigned.length === 0 ? (
              <p className="mt-2 text-[14px] text-dim">Every open mission has aircraft and crew.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {unassigned.map(({ u, m }) => (
                  <li
                    key={u.mission_id}
                    onMouseEnter={() => setHover(u.mission_id)}
                    onMouseLeave={() => setHover(null)}
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                  >
                    <PriorityTag p={m!.priority} compact />
                    <span className="num text-[14px] font-semibold">{missionCode(m!)}</span>
                    <span className="truncate text-[13px] text-dim">{m!.name}</span>
                    <WhyButton missionId={u.mission_id} className="ml-auto" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
