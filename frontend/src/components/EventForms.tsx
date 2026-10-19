"use client";

import { useMemo, useState } from "react";
import { hhmm } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Field, inputCls } from "./ui";

export type EventKind = "aircraft_down" | "new_mission" | "weather_closure" | "threat_zone" | "risk_update";

const MISSION_TYPES = [
  ["STRIKE", "Strike", 2],
  ["SEAD", "Air defence suppression", 2],
  ["CAP", "Air patrol", 2],
  ["ISR", "Reconnaissance", 1],
  ["AIRLIFT", "Airlift", 1],
] as const;

/** The form for one event type. Calls onDone(true) after a successful replan. */
export function EventForm({ kind, onDone }: { kind: EventKind; onDone: (ok: boolean) => void }) {
  const world = useStore((s) => s.world);
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const inject = useStore((s) => s.injectEvent);

  const ready = useMemo(() => (plan?.cache?.entries ?? []).filter((e) => e.valid), [plan?.cache]);
  const readyDown = new Set(ready.filter((e) => e.event.type === "aircraft_down").map((e) => String(e.event.params.aircraft_id)));
  const wxReady = ready.find((e) => e.event.type === "weather_closure");
  const threatReady = ready.find((e) => e.event.type === "threat_zone");

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
  const [tZone, setTZone] = useState("");
  const [level, setLevel] = useState("");
  const [faults, setFaults] = useState("5");
  const [hours, setHours] = useState("");

  if (!world) return null;
  const types = Object.fromEntries(world.aircraft_types.map((t) => [t.id, t.name]));
  const fleet = world.aircraft.filter((a) => a.status === "serviceable");
  const selAircraft = aircraft || fleet.find((a) => readyDown.has(a.id))?.id || fleet[0]?.id || "";
  const selLoc = loc || (wxReady ? String(wxReady.event.params.location_id) : "B2");
  const selWxStart = wxStart || (wxReady ? hhmm(Number(wxReady.event.params.start)) : "14:00");
  const selWxEnd = wxEnd || (wxReady ? hhmm(Number(wxReady.event.params.end)) : "18:00");
  const selTZone = tZone || (threatReady ? String(threatReady.event.params.zone_id) : "Z3");
  const selLevel = level || (threatReady ? String(threatReady.event.params.level) : "3");

  const submit = async () => {
    let ok = false;
    switch (kind) {
      case "aircraft_down":
        ok = await inject({ type: kind, params: { aircraft_id: selAircraft, ...(until ? { until } : {}) } }, `${selAircraft} down`);
        break;
      case "new_mission":
        ok = await inject({ type: kind, params: { mission_type: mType, priority: Number(prio), zone_id: zone, start, aircraft: Number(count) } }, `New P${prio} mission`);
        break;
      case "weather_closure":
        ok = await inject({ type: kind, params: { location_id: selLoc, start: selWxStart, end: selWxEnd } }, `${selLoc} weather closure`);
        break;
      case "threat_zone":
        ok = await inject({ type: kind, params: { zone_id: selTZone, level: Number(selLevel) } }, `${selTZone} threat`);
        break;
      case "risk_update":
        ok = await inject(
          { type: kind, params: { aircraft_id: selAircraft, ...(faults ? { faults_30d: Number(faults) } : {}), ...(hours ? { hours_since_maint: Number(hours) } : {}) } },
          `${selAircraft} maintenance report`,
        );
        break;
    }
    onDone(ok);
  };

  const aircraftSelect = (
    <select className={inputCls} value={selAircraft} onChange={(e) => setAircraft(e.target.value)}>
      {fleet.map((a) => (
        <option key={a.id} value={a.id}>
          {a.id} · {types[a.type_id]} at {a.base_id} · {Math.round((world.serviceability[a.id] ?? 0) * 100)}% ready{readyDown.has(a.id) ? " · answer prepared" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {kind === "aircraft_down" && (
        <>
          <Field label="Which aircraft?" hint="Aircraft marked 'answer prepared' already have a ready-made new plan.">
            {aircraftSelect}
          </Field>
          <Field label="Down until" hint="Leave empty for the rest of the day.">
            <input type="time" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </>
      )}
      {kind === "new_mission" && (
        <div className="grid grid-cols-2 gap-4">
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
              <option value="1">P1 critical</option>
              <option value="2">P2 high</option>
              <option value="3">P3 routine</option>
              <option value="4">P4 low</option>
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
          <Field label="Take-off time">
            <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Aircraft needed">
            <select className={inputCls} value={count} onChange={(e) => setCount(e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {kind === "weather_closure" && (
        <>
          <Field label="Where?" hint={wxReady ? "Prefilled with the closure Aeolus already prepared for." : undefined}>
            <select className={inputCls} value={selLoc} onChange={(e) => setLoc(e.target.value)}>
              {[...world.bases, ...world.zones].map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Closed from">
              <input type="time" className={inputCls} value={selWxStart} onChange={(e) => setWxStart(e.target.value)} />
            </Field>
            <Field label="Until">
              <input type="time" className={inputCls} value={selWxEnd} onChange={(e) => setWxEnd(e.target.value)} />
            </Field>
          </div>
        </>
      )}
      {kind === "threat_zone" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone">
            <select className={inputCls} value={selTZone} onChange={(e) => setTZone(e.target.value)}>
              {world.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} (now level {Math.max(0, ...world.threats.filter((t) => t.zone_id === z.id).map((t) => t.level))})
                </option>
              ))}
            </select>
          </Field>
          <Field label="New threat level">
            <select className={inputCls} value={selLevel} onChange={(e) => setLevel(e.target.value)}>
              <option value="1">1 low</option>
              <option value="2">2 medium</option>
              <option value="3">3 high</option>
            </select>
          </Field>
        </div>
      )}
      {kind === "risk_update" && (
        <>
          <Field label="Which aircraft?">{aircraftSelect}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Faults in the last 30 days">
              <input type="number" min={0} max={12} className={inputCls} value={faults} onChange={(e) => setFaults(e.target.value)} />
            </Field>
            <Field label="Hours since maintenance">
              <input type="number" min={0} max={400} placeholder="unchanged" className={inputCls} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          <p className="text-[13.5px] text-dim">This changes the predicted chance the aircraft is ready to fly, which Aeolus uses when choosing aircraft.</p>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!!busy || ((kind === "aircraft_down" || kind === "risk_update") && !selAircraft)}>
          Apply and replan
        </Button>
      </div>
    </div>
  );
}
