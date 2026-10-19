"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { cx, hhmm } from "@/lib/format";
import type { ParsedCondition } from "@/lib/types";
import { inputCls } from "./ui";

export const CONDITION_LABEL: Record<string, string> = {
  weather_closure: "Weather closure",
  zone_restriction: "Airspace closed",
  new_mission: "New mission",
  aircraft_down: "Aircraft down",
  crew_unavailable: "Crew unavailable",
  threat_zone: "Threat",
  risk_update: "Maintenance data",
  cancel_mission: "Cancel mission",
  set_priority: "Change priority",
};

const TIME_KEYS = new Set(["start", "end", "until"]);
const NUM_KEYS = new Set(["priority", "level", "aircraft", "duration_min", "window_min", "faults_30d", "hours_since_maint", "days_since_inspection"]);
const FIELD_LABEL: Record<string, string> = {
  location_id: "Place",
  zone_id: "Zone",
  aircraft_id: "Aircraft",
  crew_id: "Crew",
  mission_id: "Mission",
  mission_type: "Mission type",
  priority: "Priority (1-4)",
  level: "Threat level (0-3)",
  start: "From",
  end: "Until",
  until: "Until",
  aircraft: "Aircraft needed",
  duration_min: "Length (min)",
  window_min: "Window (min)",
  faults_30d: "Faults (30 days)",
  hours_since_maint: "Hours since maintenance",
  days_since_inspection: "Days since inspection",
  reason: "Reason",
};
const HIDDEN = new Set(["reason", "window_min"]);

function show(key: string, v: unknown): string {
  if (TIME_KEYS.has(key) && typeof v === "number") return hhmm(v);
  return String(v ?? "");
}

export function describe(c: ParsedCondition): string {
  const p = c.params as Record<string, unknown>;
  const t = (k: string) => show(k, p[k]);
  switch (c.type) {
    case "weather_closure":
      return `${t("location_id")} closed by weather ${t("start")} to ${t("end")}`;
    case "zone_restriction":
      return `${t("zone_id")} airspace closed ${t("start")} to ${t("end")}`;
    case "new_mission":
      return `New P${t("priority")} ${t("mission_type").toLowerCase()} on ${t("zone_id")} at ${t("start")}${p.aircraft ? `, ${t("aircraft")} aircraft` : ""}`;
    case "aircraft_down":
      return `${t("aircraft_id")} down until ${p.until !== undefined && Number(p.until) < 1440 ? t("until") : "end of day"}`;
    case "crew_unavailable":
      return `Crew ${t("crew_id")} unavailable ${p.start !== undefined ? `${t("start")} to ${t("end")}` : "today"}`;
    case "threat_zone":
      return `${t("zone_id")} threat raised to level ${t("level")}`;
    case "risk_update":
      return `${t("aircraft_id")} maintenance update`;
    case "cancel_mission":
      return `Cancel ${t("mission_id")}`;
    case "set_priority":
      return `${t("mission_id")} becomes P${t("priority")}`;
  }
  return c.description;
}

export default function ConditionChip({ c, editable, onChange }: { c: ParsedCondition; editable: boolean; onChange: (c: ParsedCondition | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const keys = Object.keys(c.params).filter((k) => !HIDDEN.has(k));

  const startEdit = () => {
    setDraft(Object.fromEntries(keys.map((k) => [k, show(k, c.params[k])])));
    setEditing(true);
  };
  const save = () => {
    const params: Record<string, unknown> = { ...c.params };
    for (const k of keys) {
      const v = draft[k]?.trim() ?? "";
      params[k] = NUM_KEYS.has(k) && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
    }
    const next = { ...c, params };
    onChange({ ...next, description: describe(next) });
    setEditing(false);
  };

  return (
    <div className={cx("rounded-xl border bg-white", editing ? "border-primary p-3" : "border-primary-100")}>
      {!editing ? (
        <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
          <span className="rounded-md bg-primary-50 px-2 py-0.5 text-[12px] font-semibold text-primary-dark">{CONDITION_LABEL[c.type] ?? c.type}</span>
          <span className="min-w-0 flex-1 text-[14.5px] text-text">{c.description}</span>
          {editable && (
            <>
              <button onClick={startEdit} className="h-8 w-8 rounded-lg text-dim hover:bg-primary-50 hover:text-primary-dark" aria-label={`Edit ${c.description}`}>
                <Pencil size={15} className="mx-auto" />
              </button>
              <button onClick={() => onChange(null)} className="h-8 w-8 rounded-lg text-dim hover:bg-coral-dim hover:text-coral" aria-label={`Remove ${c.description}`}>
                <X size={16} className="mx-auto" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-2 text-[13px] font-semibold text-primary-dark">Edit: {CONDITION_LABEL[c.type] ?? c.type}</div>
          <div className="grid grid-cols-2 gap-3">
            {keys.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[12.5px] text-dim">{FIELD_LABEL[k] ?? k}</span>
                <input
                  className={cx(inputCls, "!h-9")}
                  type={TIME_KEYS.has(k) ? "time" : "text"}
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="h-9 rounded-lg px-3 text-[13.5px] text-muted hover:bg-panel-2">
              Cancel
            </button>
            <button onClick={save} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13.5px] font-medium text-white hover:bg-primary-dark">
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
