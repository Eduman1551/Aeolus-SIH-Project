"use client";

import { CloudFog, Crosshair, Plane, PlaneLanding, Radar, Radio, ShieldAlert, Wrench, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { cx, hhmm } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { CacheEntry, EventRecord, FeedMsg } from "@/lib/types";
import { Button, inputCls, Pill, SectionLabel } from "./ui";

const NO_EVENTS: EventRecord[] = [];

type Kind = "aircraft_down" | "new_mission" | "weather_closure" | "threat_zone" | "risk_update";

const KINDS: { id: Kind; label: string; icon: React.ReactNode }[] = [
  { id: "aircraft_down", label: "Aircraft down", icon: <PlaneLanding size={14} /> },
  { id: "new_mission", label: "New mission", icon: <Crosshair size={14} /> },
  { id: "weather_closure", label: "Weather closure", icon: <CloudFog size={14} /> },
  { id: "threat_zone", label: "New threat", icon: <ShieldAlert size={14} /> },
  { id: "risk_update", label: "Maintenance", icon: <Wrench size={14} /> },
];

const MISSION_TYPES = [
  ["STRIKE", "Strike", 2],
  ["SEAD", "SEAD", 2],
  ["CAP", "Combat air patrol", 2],
  ["ISR", "Reconnaissance", 1],
  ["AIRLIFT", "Airlift", 1],
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-dim">{label}</span>
      {children}
    </label>
  );
}

function Contingencies() {
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const inject = useStore((s) => s.injectEvent);
  const cache = plan?.cache;
  const tone = cache?.status === "ready" ? "ok" : cache?.status === "building" ? "warn" : "neutral";
  return (
    <div className="border-b border-line px-3 py-2.5">
      <SectionLabel
        right={
          cache && (
            <Pill tone={tone}>
              {cache.status === "ready" ? `ready · built in ${(cache.build_ms / 1000).toFixed(2)} s` : cache.status === "stale" ? "stale, picture changed" : cache.status}
            </Pill>
          )
        }
      >
        Prepared contingencies
      </SectionLabel>
      {!plan?.active ? (
        <p className="mt-1.5 text-[12px] leading-5 text-dim">After a plan is published, Aeolus pre-solves the 3 to 5 likeliest disruptions here so they can be answered instantly.</p>
      ) : cache?.status === "building" ? (
        <p className="mt-1.5 text-[12px] text-muted">Pre-solving likely disruptions in the background...</p>
      ) : (
        <ul className="mt-1.5 flex max-h-[122px] flex-col gap-1 overflow-y-auto pr-1">
          {(cache?.entries ?? []).map((e: CacheEntry) => (
            <li key={e.signature} className="flex items-center gap-2 rounded-md border border-line bg-panel-2/60 py-1 pl-2 pr-1" title={`${e.label}. Why: ${e.why}`}>
              <Zap size={12} className={e.valid ? "shrink-0 text-teal" : "shrink-0 text-dim"} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-text">{e.label.replace(" (reported unserviceable)", "")}</span>
              <span className="mono shrink-0 text-[10.5px] text-dim">{e.changed} chg</span>
              <Button
                size="sm"
                className="!h-6 !px-2"
                disabled={!!busy}
                onClick={() => inject({ type: e.event.type, params: e.event.params }, e.label)}
                title={e.valid ? "Will be served from the cache" : "The picture changed since this was prepared, so it will be re-solved"}
              >
                Inject
              </Button>
            </li>
          ))}
          {cache && cache.entries.length === 0 && <li className="text-[12px] text-dim">No contingencies prepared.</li>}
        </ul>
      )}
    </div>
  );
}

function EventForm() {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const inject = useStore((s) => s.injectEvent);
  const [kind, setKind] = useState<Kind>("aircraft_down");

  const cachedDown = useMemo(
    () => new Set((plan?.cache?.entries ?? []).filter((e) => e.valid && e.event.type === "aircraft_down").map((e) => String(e.event.params.aircraft_id))),
    [plan?.cache],
  );
  const wxCached = plan?.cache?.entries.find((e) => e.event.type === "weather_closure");

  const [aircraft, setAircraft] = useState("");
  const [until, setUntil] = useState("");
  const [mType, setMType] = useState("STRIKE");
  const [prio, setPrio] = useState("1");
  const [zone, setZone] = useState("Z3");
  const [start, setStart] = useState("16:00");
  const [count, setCount] = useState("2");
  const [loc, setLoc] = useState("");
  const [wxStart, setWxStart] = useState("");
  const [wxEnd, setWxEnd] = useState("");
  const [tZone, setTZone] = useState("Z3");
  const [level, setLevel] = useState("3");
  const [faults, setFaults] = useState("5");
  const [hours, setHours] = useState("");

  if (!world) return null;
  const aircraftList = world.aircraft.filter((a) => a.status === "serviceable");
  const types = Object.fromEntries(world.aircraft_types.map((t) => [t.id, t.name]));
  const selAircraft = aircraft || aircraftList.find((a) => cachedDown.has(a.id))?.id || aircraftList[0]?.id || "";
  const selLoc = loc || (wxCached ? String(wxCached.event.params.location_id) : "B2");
  const selWxStart = wxStart || (wxCached ? hhmm(Number(wxCached.event.params.start)) : "14:00");
  const selWxEnd = wxEnd || (wxCached ? hhmm(Number(wxCached.event.params.end)) : "18:00");

  const submit = () => {
    switch (kind) {
      case "aircraft_down":
        return inject({ type: kind, params: { aircraft_id: selAircraft, ...(until ? { until } : {}) } }, `${selAircraft} down`);
      case "new_mission":
        return inject(
          { type: kind, params: { mission_type: mType, priority: Number(prio), zone_id: zone, start, aircraft: Number(count) } },
          `new P${prio} ${mType.toLowerCase()} on ${zone}`,
        );
      case "weather_closure":
        return inject({ type: kind, params: { location_id: selLoc, start: selWxStart, end: selWxEnd } }, `${selLoc} weather closure`);
      case "threat_zone":
        return inject({ type: kind, params: { zone_id: tZone, level: Number(level) } }, `${tZone} threat level ${level}`);
      case "risk_update":
        return inject(
          { type: kind, params: { aircraft_id: selAircraft, ...(faults ? { faults_30d: Number(faults) } : {}), ...(hours ? { hours_since_maint: Number(hours) } : {}) } },
          `${selAircraft} maintenance report`,
        );
    }
  };

  const aircraftSelect = (
    <select className={inputCls} value={selAircraft} onChange={(e) => setAircraft(e.target.value)} aria-label="Aircraft">
      {aircraftList.map((a) => (
        <option key={a.id} value={a.id}>
          {a.id} · {types[a.type_id]} · {a.base_id} · {Math.round((world.serviceability[a.id] ?? 0) * 100)}%{cachedDown.has(a.id) ? "  (contingency ready)" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div className="border-b border-line px-3 py-2">
      <SectionLabel>Inject an event</SectionLabel>
      <div className="mt-2 grid grid-cols-5 gap-1" role="tablist" aria-label="Event type">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cx(
              "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1 text-[10.5px] leading-tight transition-colors",
              kind === k.id ? "border-amber/60 bg-amber-dim/25 text-amber" : "border-line bg-panel-2/50 text-muted hover:border-line-2 hover:text-text",
            )}
          >
            {k.icon}
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {kind === "aircraft_down" && (
          <>
            <div className="col-span-2">
              <Field label="Aircraft">{aircraftSelect}</Field>
            </div>
            <Field label="Down until (blank = end of day)">
              <input type="time" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </>
        )}
        {kind === "new_mission" && (
          <>
            <Field label="Mission type">
              <select
                className={inputCls}
                value={mType}
                onChange={(e) => {
                  setMType(e.target.value);
                  setCount(String(MISSION_TYPES.find((m) => m[0] === e.target.value)?.[2] ?? 1));
                }}
              >
                {MISSION_TYPES.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputCls} value={prio} onChange={(e) => setPrio(e.target.value)}>
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>
                    P{p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target zone">
              <select className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)}>
                {world.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Take-off">
                <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Aircraft">
                <select className={inputCls} value={count} onChange={(e) => setCount(e.target.value)}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
        {kind === "weather_closure" && (
          <>
            <div className="col-span-2">
              <Field label="Location">
                <select className={inputCls} value={selLoc} onChange={(e) => setLoc(e.target.value)}>
                  {[...world.bases, ...world.zones].map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="From">
              <input type="time" className={inputCls} value={selWxStart} onChange={(e) => setWxStart(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="time" className={inputCls} value={selWxEnd} onChange={(e) => setWxEnd(e.target.value)} />
            </Field>
          </>
        )}
        {kind === "threat_zone" && (
          <>
            <Field label="Zone">
              <select className={inputCls} value={tZone} onChange={(e) => setTZone(e.target.value)}>
                {world.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} (now L{Math.max(0, ...world.threats.filter((t) => t.zone_id === z.id).map((t) => t.level))})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Threat level">
              <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="1">1 low</option>
                <option value="2">2 medium</option>
                <option value="3">3 high</option>
              </select>
            </Field>
          </>
        )}
        {kind === "risk_update" && (
          <>
            <div className="col-span-2">
              <Field label="Aircraft">{aircraftSelect}</Field>
            </div>
            <Field label="Faults in last 30 days">
              <input type="number" min={0} max={12} className={inputCls} value={faults} onChange={(e) => setFaults(e.target.value)} />
            </Field>
            <Field label="Hours since maintenance">
              <input type="number" min={0} max={400} placeholder="unchanged" className={inputCls} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] leading-4 text-dim">
          {kind === "risk_update" ? "Feeds the serviceability model, which feeds the solver." : "Classified, checked against the cache, then replanned."}
        </span>
        <Button variant="primary" size="sm" onClick={submit} disabled={!!busy || (kind !== "new_mission" && kind !== "weather_closure" && kind !== "threat_zone" && !selAircraft)}>
          Inject event
        </Button>
      </div>
    </div>
  );
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  telemetry: <Plane size={12} />,
  weather_obs: <CloudFog size={12} />,
  crew: <Radio size={12} />,
  logistics: <Wrench size={12} />,
  intel: <Radar size={12} />,
};

function LiveFeed() {
  const feed = useStore((s) => s.feed);
  const events = useStore((s) => s.plan?.events) ?? NO_EVENTS;
  const ws = useStore((s) => s.ws);
  const items = useMemo(() => {
    const evs = events.map((e) => ({ key: `e${e.id}`, at: e.sim_time, event: e, msg: null as FeedMsg | null }));
    const msgs = feed.map((m) => ({ key: `f${m.id}`, at: m.sim_time, event: null, msg: m }));
    return [...evs, ...msgs].sort((a, b) => b.at - a.at || (a.event ? -1 : 1)).slice(0, 80);
  }, [feed, events]);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5">
      <SectionLabel
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={cx("h-1.5 w-1.5 rounded-full", ws === "open" ? "live-dot bg-teal" : "bg-coral")} />
            {ws === "open" ? "streaming from 5 source systems" : "feed paused"}
          </span>
        }
      >
        Live feed and events
      </SectionLabel>
      <ul className="mt-1.5 min-h-0 flex-1 overflow-y-auto pb-2 pr-1" aria-live="polite">
        {items.length === 0 && <li className="py-4 text-center text-[12px] text-dim">Waiting for the first feed message...</li>}
        {items.map((it) =>
          it.event ? (
            <li key={it.key} className="fade-in my-1 rounded-md border border-amber/30 bg-amber-dim/15 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="mono text-amber">{it.event.clock}</span>
                <span className="label text-[10.5px] text-amber">{it.event.classification.category}</span>
                <Pill tone={it.event.classification.severity === "high" ? "bad" : it.event.classification.severity === "medium" ? "warn" : "neutral"} className="!py-0 text-[10px]">
                  {it.event.classification.severity}
                </Pill>
                <span className={cx("mono ml-auto text-[10.5px]", it.event.cache_hit ? "text-teal" : "text-muted")}>
                  {it.event.path}
                  {it.event.replan_ms != null && ` · ${(it.event.replan_ms / 1000).toFixed(2)} s`}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-text">{it.event.description}</div>
              <div className="text-[11px] text-dim">
                {it.event.origin} · {it.event.classification.affected.length} active sorties affected
              </div>
            </li>
          ) : (
            <li key={it.key} className="fade-in flex items-start gap-2 border-b border-line/50 py-1 text-[11.5px] leading-[17px]">
              <span className="mono shrink-0 text-dim">{it.msg!.clock}</span>
              <span className="mt-[3px] shrink-0 text-dim">{SOURCE_ICON[it.msg!.kind] ?? <Radio size={12} />}</span>
              <span className="min-w-0 text-muted">
                {it.msg!.text}
                <span className="block text-[10.5px] text-dim">{it.msg!.source}</span>
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export default function EventsPanel() {
  return (
    <div className="flex h-full flex-col">
      <Contingencies />
      <EventForm />
      <LiveFeed />
    </div>
  );
}
