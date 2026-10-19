export function hhmm(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmss(min: number): string {
  const total = Math.max(0, Math.floor(min * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function secs(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

export const PRIORITY_COLOR: Record<number, string> = {
  1: "var(--color-p1)",
  2: "var(--color-p2)",
  3: "var(--color-p3)",
  4: "var(--color-p4)",
};

/** text colour that stays readable on each priority fill */
export const PRIORITY_INK: Record<number, string> = {
  1: "#ffffff",
  2: "#ffffff",
  3: "#0b1f44",
  4: "#0b1f44",
};

export const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 critical",
  2: "P2 high",
  3: "P3 routine",
  4: "P4 low",
};

/** fragility from the backend (low/medium/high) shown as plan strength */
export const STRENGTH: Record<string, { label: string; short: string; tone: "ok" | "warn" | "bad"; color: string }> = {
  low: { label: "Strong", short: "S", tone: "ok", color: "var(--color-teal)" },
  medium: { label: "Moderate", short: "M", tone: "warn", color: "var(--color-amber)" },
  high: { label: "Weak", short: "W", tone: "bad", color: "var(--color-coral)" },
};

export const FRAGILITY_COLOR: Record<string, string> = {
  low: "var(--color-teal)",
  medium: "var(--color-amber)",
  high: "var(--color-coral)",
};

export const PATH_LABEL: Record<string, string> = {
  "cache hit": "used a prepared answer",
  "cache miss": "solved fresh",
  "cache stale": "solved fresh (prepared answer was out of date)",
  "reject loop": "found after your rejection",
  initial: "first plan",
  "re-solve": "solved fresh",
};

export const CHANGE_LABEL: Record<string, string> = {
  aircraft_swap: "Aircraft swapped",
  crew_swap: "Crew swapped",
  retimed: "Time moved",
  removed: "Dropped",
  added: "Added",
};

export function sortieKey(s: { mission_id: string; aircraft_id: string }): string {
  return `${s.mission_id}/${s.aircraft_id}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
