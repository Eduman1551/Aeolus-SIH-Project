// Mirrors the backend Pydantic models (backend/app/fusion/schema.py and planning views).

export interface Meta {
  source: string;
  updated_at: string;
}
export interface Window {
  start: number;
  end: number;
  reason: string;
}
export interface Base {
  id: string;
  name: string;
  x_km: number;
  y_km: number;
  meta?: Meta;
}
export interface Zone extends Base {}
export interface AircraftType {
  id: string;
  name: string;
  role: string;
  radius_km: number;
  turnaround_min: number;
  min_ceiling_ft: number;
  min_vis_km: number;
  max_threat: number;
}
export interface Aircraft {
  id: string;
  type_id: string;
  base_id: string;
  status: "serviceable" | "unserviceable";
  unavailable: Window[];
  risk: {
    hours_since_maint: number;
    age_years: number;
    faults_30d: number;
    days_since_inspection: number;
    sorties_7d: number;
  };
  telemetry: { fuel_pct: number; position: string; last_report: string | null };
  meta?: Meta;
}
export interface Crew {
  id: string;
  callsign: string;
  base_id: string;
  qualified_types: string[];
  duty_start: number;
  duty_end: number;
  max_duty_min: number;
  status: "available" | "unavailable";
  unavailable: Window[];
  checked_in: boolean;
}
export interface WeatherSegment {
  location_id: string;
  start: number;
  end: number;
  ceiling_ft: number;
  vis_km: number;
  wind_kt: number;
  kind: "forecast" | "closure";
  note: string;
}
export interface Restriction {
  id: string;
  zone_id: string;
  start: number;
  end: number;
  reason: string;
}
export interface Threat {
  id: string;
  zone_id: string;
  level: number;
  start: number;
  end: number;
  note: string;
}
export interface MissionType {
  id: string;
  name: string;
  eligible_types: string[];
  loadouts: Record<string, Record<string, number>>;
  target_min_ceiling_ft: number;
  target_min_vis_km: number;
}
export interface Mission {
  id: string;
  name: string;
  type_id: string;
  priority: number;
  zone_id: string;
  window_start: number;
  window_end: number;
  duration_min: number;
  aircraft_required: number;
  status: "open" | "cancelled";
  origin: string;
}
export interface WeaponStock {
  base_id: string;
  weapon_id: string;
  qty: number;
}
export interface FeedMsg {
  id: number;
  sim_time: number;
  clock: string;
  wall: string;
  source: string;
  kind: string;
  entity: string;
  text: string;
}
export interface World {
  now: number;
  version: number;
  fingerprint: string;
  seed: number;
  synthetic: boolean;
  rules: { brief_min: number; debrief_min: number; horizon_start: number; horizon_end: number; freeze_min: number };
  bases: Base[];
  zones: Zone[];
  restrictions: Restriction[];
  aircraft_types: AircraftType[];
  aircraft: Aircraft[];
  crews: Crew[];
  stock: WeaponStock[];
  weather: WeatherSegment[];
  threats: Threat[];
  mission_types: MissionType[];
  missions: Mission[];
  observations: Record<string, { ceiling_ft: number; vis_km: number; at: string }>;
  sources: Record<string, { source: string; records: number; loaded_at: string }>;
  fusion_issues: string[];
  serviceability: Record<string, number>;
  weather_impact: Record<string, number>;
  model: { trained_on?: string; test_auc?: number; n_train?: number };
  feed: FeedMsg[];
}

export interface Sortie {
  mission_id: string;
  aircraft_id: string;
  crew_id: string;
  takeoff: number;
  landing: number;
  loadout: Record<string, number>;
}
export interface Plan {
  id: string;
  created_at: string;
  source: "cpsat" | "greedy" | "cache";
  status: string;
  sorties: Sortie[];
  unassigned: { mission_id: string; reason: string }[];
  parent_id: string | null;
  solve_ms: number;
  solver_status: string;
  objective: number | null;
}
export interface Violation {
  rule: string;
  message: string;
  mission_id: string | null;
  aircraft_id: string | null;
  crew_id: string | null;
}
export interface ValidationReport {
  ok: boolean;
  violations: Violation[];
  rules: { id: string; label: string; passed: boolean; count: number }[];
  checked_sorties: number;
  committed_sorties: number;
}
export interface SortieView {
  aircraft_id: string;
  crew_id: string;
  takeoff: number;
  landing: number;
}
export interface Change {
  id: string;
  kind: "aircraft_swap" | "crew_swap" | "retimed" | "removed" | "added";
  mission_id: string;
  mission_name: string;
  priority: number;
  old: SortieView | null;
  new: SortieView | null;
  reason: string;
  facts: string[];
}
export interface Fragility {
  level: "low" | "medium" | "high";
  score: number;
  backup_aircraft: string[];
  backup_crews: string[];
  note: string;
}
export interface Proposal {
  id: string;
  plan: Plan;
  previous_id: string | null;
  trigger: { kind: string; label: string; note?: string; conditions?: string[]; parser?: string; text?: string; compared_with?: string };
  validation: ValidationReport;
  publishable: boolean;
  changes: Change[];
  stability: { changed: number; added: number; total: number; stability_pct: number; changed_pct: number };
  summary: string;
  summary_llm: string | null;
  timing: { total_ms: number; solve_ms: number; path: string; solver_status: string };
  fragility: Record<string, Fragility>;
  created_at: string;
}
export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  display: string;
  detail: string;
  baseline: string | null;
  delta: string | null;
  good: boolean | null;
  target: string;
}
export interface EventRecord {
  id: string;
  type: string;
  origin: string;
  params: Record<string, unknown>;
  sim_time: number;
  clock: string;
  description: string;
  classification: { category: string; severity: string; signature: string; affected: string[]; summary: string };
  cache_hit: boolean;
  path: string;
  replan_ms: number | null;
  at?: string;
}
export interface CacheEntry {
  signature: string;
  label: string;
  why: string;
  event: { type: string; params: Record<string, unknown>; origin: string };
  solve_ms: number;
  changed: number;
  unassigned: number;
  valid: boolean;
}
export interface PlanStatus {
  status: "no_plan" | "pending_approval" | "active" | "ended";
  now: number;
  clock: string;
  paused: boolean;
  world_version: number;
  active: Plan | null;
  active_validation: ValidationReport | null;
  active_fragility: Record<string, Fragility>;
  proposal: Proposal | null;
  baseline: Plan | null;
  initial: Plan | null;
  kpis: Kpi[];
  last_result: {
    plan_id: string;
    path: string;
    total_ms: number;
    changed: number;
    added: number;
    total: number;
    publishable: boolean;
    label: string;
  } | null;
  events: EventRecord[];
  history: { id: string; status: string; at: string; label?: string }[];
  ended: { plan_id: string; summary: string; lines: string[]; kpis: Kpi[]; at: string; reason: string } | null;
  stability_lambda: number;
  cache: { status: string; build_ms: number; entries: CacheEntry[] };
  kpi_history: {
    replans: { ms: number; path: string }[];
    stabilities: number[];
    manual_baseline_min: number;
    greedy_ms: number | null;
    initial_solve_ms: number | null;
  };
}
export interface Health {
  ok: boolean;
  db: { configured: boolean; online: boolean; error: string | null };
  llm: { configured: boolean; model?: string | null; mode: string; last_error?: string | null };
  synthetic_data: boolean;
}
export interface EventInput {
  type: string;
  params: Record<string, unknown>;
  origin?: string;
}
export interface ParsedCondition {
  type: string;
  params: Record<string, unknown>;
  description: string;
}
