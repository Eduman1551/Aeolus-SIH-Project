"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { cx, hhmm, PRIORITY_COLOR } from "@/lib/format";
import { missionCode, positionOf, shownPlan, stageOf } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { Sortie } from "@/lib/types";
import { Skeleton } from "./ui";

const THREAT_COLOR: Record<number, string> = { 1: "#f59e0b", 2: "#ea580c", 3: "#dc2626" };

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** small parallel offset so routes to the same zone do not sit on top of each other */
function offsetPts(a: { x: number; y: number }, b: { x: number; y: number }, key: string) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = ((hash(key) % 5) - 2) * 7;
  const nx = (-dy / len) * k;
  const ny = (dx / len) * k;
  return { a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } };
}

function Plane({ size }: { size: number }) {
  const s = size / 24;
  return (
    <path
      transform={`scale(${s}) translate(-12 -12)`}
      d="M22 12 L14 10 L10 2 L8 2 L10 10 L4 10.5 L2 7.5 L0.8 7.5 L1.8 12 L0.8 16.5 L2 16.5 L4 13.5 L10 14 L8 22 L10 22 L14 14 Z"
      fill="var(--color-navy)"
      stroke="#fff"
      strokeWidth={1.4}
    />
  );
}

export default function TacticalMap({ compact = false, className }: { compact?: boolean; className?: string }) {
  const map = useStore((s) => s.map);
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const view = useStore((s) => s.view);
  const hover = useStore((s) => s.hoverMission);
  const setHover = useStore((s) => s.setHoverMission);
  const openDrawer = useStore((s) => s.openDrawer);
  const select = useStore((s) => s.setSelected);
  const highlight = useStore((s) => s.highlight);

  const now = plan?.now ?? 360;
  const shown = shownPlan(plan, view);
  const showingProposal = !!plan?.proposal && shown?.id === plan.proposal.id;

  const missions = useMemo(() => Object.fromEntries((world?.missions ?? []).map((m) => [m.id, m])), [world?.missions]);
  const aircraft = useMemo(() => Object.fromEntries((world?.aircraft ?? []).map((a) => [a.id, a])), [world?.aircraft]);
  const places = useMemo(() => {
    const out: Record<string, { x: number; y: number; name: string }> = {};
    for (const b of map?.bases ?? []) out[b.id] = b;
    for (const z of map?.zones ?? []) out[z.id] = z;
    return out;
  }, [map]);

  const changed = useMemo(() => {
    const set = new Set<string>();
    if (showingProposal) plan!.proposal!.changes.forEach((c) => set.add(c.mission_id));
    if (Date.now() < highlight.until) highlight.keys.forEach((k) => set.add(k.split("/")[0]));
    return set;
  }, [showingProposal, plan, highlight]);

  if (!map || !world) return <Skeleton className={cx("h-full min-h-[300px] w-full", className)} />;

  const fs = compact ? 22 : 15;
  const routes: { key: string; mission: string; base: string; zone: string; p: number; sorties: Sortie[] }[] = [];
  for (const s of shown?.sorties ?? []) {
    const m = missions[s.mission_id];
    const a = aircraft[s.aircraft_id];
    if (!m || !a) continue;
    const key = `${m.id}|${a.base_id}`;
    const r = routes.find((x) => x.key === key);
    if (r) r.sorties.push(s);
    else routes.push({ key, mission: m.id, base: a.base_id, zone: m.zone_id, p: m.priority, sorties: [s] });
  }
  const ghosts = showingProposal
    ? plan!.proposal!.changes
        .filter((c) => c.old && (c.kind === "removed" || c.kind === "aircraft_swap"))
        .map((c) => ({ key: `g${c.id}`, mission: c.mission_id, base: aircraft[c.old!.aircraft_id]?.base_id, zone: missions[c.mission_id]?.zone_id }))
        .filter((g) => g.base && g.zone)
    : [];

  const active = (start: number, end: number) => start <= now && now < end;
  const upcoming = (end: number) => end > now;
  const flying = (shown?.sorties ?? [])
    .map((s) => ({ s, stage: stageOf(s, now) }))
    .filter((x) => x.stage !== "scheduled" && x.stage !== "complete");

  return (
    <div className={cx("relative overflow-hidden rounded-2xl bg-[#e8f1fe]", className)}>
      <svg viewBox={`0 0 ${map.bounds.width} ${map.bounds.height}`} className="block h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Theatre map">
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" stroke="#dbe6f6" strokeWidth="1" />
          </pattern>
          <pattern id="hatch-r" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#b45309" strokeWidth="2" strokeOpacity="0.35" />
          </pattern>
          <filter id="cloud" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* land, grid, terrain */}
        <polygon points={map.coast.map((p) => p.join(",")).join(" ")} fill="#ffffff" stroke="#bcd0ec" strokeWidth="2" />
        <rect width={map.bounds.width} height={map.bounds.height} fill="url(#grid)" />
        {map.ridges.map((r, i) => (
          <polyline key={i} points={r.map((p) => p.join(",")).join(" ")} fill="none" stroke="#c7d3e3" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
        ))}
        <polyline points={map.river.map((p) => p.join(",")).join(" ")} fill="none" stroke="#a9c8f5" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {map.sector_lines.map((l, i) => (
          <polyline key={i} points={l.map((p) => p.join(",")).join(" ")} fill="none" stroke="#c9d6ea" strokeWidth="1.5" strokeDasharray="10 8" />
        ))}
        {!compact &&
          map.sectors.map((s) => (
            <text key={s.name} x={s.x} y={s.y} fontSize={fs + 2} fontWeight={700} letterSpacing="3" fill="#b6c6dc" textAnchor="middle">
              {s.name}
            </text>
          ))}

        {/* restricted airspace */}
        {map.restrictions
          .filter((r) => upcoming(r.end))
          .map((r) => (
            <g key={r.id} opacity={active(r.start, r.end) ? 1 : 0.5}>
              <circle cx={r.x} cy={r.y} r={r.radius} fill="url(#hatch-r)" stroke="#b45309" strokeWidth="2" strokeDasharray="8 6" />
              {!compact && (
                <text x={r.x} y={r.y - r.radius - 8} fontSize={fs - 2} fill="#92400e" textAnchor="middle" fontWeight={600}>
                  RESTRICTED {hhmm(r.start)}-{hhmm(r.end)}Z
                </text>
              )}
            </g>
          ))}

        {/* weather cells */}
        {map.weather_cells
          .filter((w) => upcoming(w.end))
          .map((w) => {
            const on = active(w.start, w.end);
            const closed = w.severity === "closed";
            return (
              <g key={w.id} opacity={on ? 0.95 : 0.45} className="cursor-pointer" onClick={() => openDrawer({ kind: w.location_id.startsWith("B") ? "base" : "zone", id: w.location_id })}>
                <circle cx={w.x + 18} cy={w.y - 22} r={w.radius} fill={closed ? "#fca5a5" : "#94a3b8"} filter="url(#cloud)" opacity={0.55} />
                <circle cx={w.x - 16} cy={w.y - 10} r={w.radius * 0.8} fill={closed ? "#fca5a5" : "#94a3b8"} filter="url(#cloud)" opacity={0.45} />
                {!compact && (
                  <text x={w.x} y={w.y - w.radius - 18} fontSize={fs - 3} fill={closed ? "#b91c1c" : "#475569"} textAnchor="middle">
                    {closed ? "CLOSED" : "LOW CLOUD"} {hhmm(w.start)}-{hhmm(w.end)}Z
                  </text>
                )}
              </g>
            );
          })}

        {/* threat rings */}
        {map.threats
          .filter((t) => active(t.start, t.end) && t.level > 0)
          .map((t) => (
            <circle key={t.id} cx={t.x} cy={t.y} r={t.radius} fill={THREAT_COLOR[t.level]} fillOpacity={0.1 + t.level * 0.03} stroke={THREAT_COLOR[t.level]} strokeOpacity={0.55} strokeWidth="2" strokeDasharray="5 5" />
          ))}

        {/* old routes being replaced */}
        {ghosts.map((g) => {
          const { a, b } = offsetPts(places[g.base!], places[g.zone!], g.key);
          return (
            <motion.line key={g.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d97706" strokeWidth="3" strokeDasharray="6 7" initial={{ opacity: 0.9 }} animate={{ opacity: 0.35 }} transition={{ duration: 1.2 }} />
          );
        })}

        {/* mission routes */}
        {routes.map((r) => {
          const { a, b } = offsetPts(places[r.base], places[r.zone], r.key);
          const isChanged = changed.has(r.mission);
          const dim = hover && hover !== r.mission;
          const lit = hover === r.mission;
          const m = missions[r.mission];
          return (
            <g
              key={`${shown?.id}-${r.key}`}
              className="cursor-pointer"
              opacity={dim ? 0.18 : 1}
              onMouseEnter={() => setHover(r.mission)}
              onMouseLeave={() => setHover(null)}
              onClick={() => select(r.sorties[0])}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="18" />
              <motion.line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={PRIORITY_COLOR[r.p]}
                strokeWidth={lit ? 5.5 : 3.2}
                strokeLinecap="round"
                initial={isChanged ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, ease: "easeInOut" }}
              />
              {(lit || isChanged) && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} fontSize={fs - 3} fontWeight={700} fill={PRIORITY_COLOR[Math.min(r.p, 2)]} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth="4">
                  {m ? missionCode(m) : r.mission} P{r.p}
                </text>
              )}
              {isChanged && (
                <motion.circle cx={b.x} cy={b.y} fill="none" stroke="#f59e0b" strokeWidth="3" initial={{ r: 8, opacity: 0.9 }} animate={{ r: 42, opacity: 0 }} transition={{ duration: 1.4, repeat: 3, ease: "easeOut" }} />
              )}
            </g>
          );
        })}

        {/* target zones */}
        {map.zones.map((z) => (
          <g key={z.id} className="cursor-pointer" onClick={() => openDrawer({ kind: "zone", id: z.id })}>
            <circle cx={z.x} cy={z.y} r={14} fill="#fff" stroke="var(--color-navy)" strokeWidth="2.5" />
            <circle cx={z.x} cy={z.y} r={4} fill="var(--color-navy)" />
            <line x1={z.x - 22} y1={z.y} x2={z.x - 15} y2={z.y} stroke="var(--color-navy)" strokeWidth="2.5" />
            <line x1={z.x + 15} y1={z.y} x2={z.x + 22} y2={z.y} stroke="var(--color-navy)" strokeWidth="2.5" />
            <text x={z.x} y={z.y + 36} fontSize={fs} fontWeight={600} fill="var(--color-navy)" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth="5">
              {compact ? z.id : z.name.replace(/^Zone \d /, `${z.id} `)}
            </text>
          </g>
        ))}

        {/* bases */}
        {map.bases.map((b) => (
          <g key={b.id} className="cursor-pointer" onClick={() => openDrawer({ kind: "base", id: b.id })}>
            <rect x={b.x - 16} y={b.y - 16} width={32} height={32} rx={7} fill="var(--color-primary)" stroke="#fff" strokeWidth="3" />
            <text x={b.x} y={b.y + 6} fontSize={16} fontWeight={800} fill="#fff" textAnchor="middle">
              {b.id}
            </text>
            <text x={b.x} y={b.y + 42} fontSize={fs} fontWeight={700} fill="var(--color-navy)" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth="5">
              {b.name.replace(/^Base \d /, "")}
            </text>
            {!compact && (
              <text x={b.x} y={b.y + 60} fontSize={fs - 3} fill="#5b6b8c" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth="4">
                {b.wing}
              </text>
            )}
          </g>
        ))}

        {/* aircraft moving with the scenario clock */}
        {flying.map(({ s, stage }, i) => {
          const a = aircraft[s.aircraft_id];
          const m = missions[s.mission_id];
          if (!a || !m || !places[a.base_id] || !places[m.zone_id]) return null;
          const { a: p0, b: p1 } = offsetPts(places[a.base_id], places[m.zone_id], `${m.id}|${a.base_id}`);
          const pos = positionOf(s, now, p0, p1);
          const x = stage === "taxi" ? p0.x + 22 + (i % 3) * 10 : pos.x;
          const y = stage === "taxi" ? p0.y - 22 : pos.y;
          const lit = hover === s.mission_id;
          return (
            <g
              key={`${s.mission_id}-${s.aircraft_id}`}
              style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 1s linear" }}
              className="cursor-pointer"
              onClick={() => openDrawer({ kind: "aircraft", id: s.aircraft_id })}
              onMouseEnter={() => setHover(s.mission_id)}
              onMouseLeave={() => setHover(null)}
            >
              {lit && <circle r={26} fill="none" stroke="#f59e0b" strokeWidth="3" />}
              <g transform={`rotate(${pos.heading})`}>
                <Plane size={compact ? 46 : 36} />
              </g>
              {!compact && (
                <text x={20} y={-16} fontSize={fs - 1} fontWeight={700} fill="var(--color-navy)" paintOrder="stroke" stroke="#fff" strokeWidth="4">
                  {a.callsign}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-2.5 py-1 text-[12.5px] font-semibold text-navy shadow-sm">
        <span className="num">{hhmm(now).replace(":", "")}Z</span> · {flying.filter((f) => f.stage !== "taxi").length} airborne
        {showingProposal && <span className="ml-1 text-amber">· proposed plan</span>}
      </div>
      {!compact && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/90 px-3 py-2 text-[12px] text-muted shadow-sm">
          {[1, 2, 3, 4].map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="h-[3px] w-5 rounded" style={{ background: PRIORITY_COLOR[p] }} />P{p}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-[#dc2626] bg-[#dc2626]/15" />threat
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#94a3b8]/60" />weather
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-[#b45309]" />restricted
          </span>
        </div>
      )}
    </div>
  );
}
