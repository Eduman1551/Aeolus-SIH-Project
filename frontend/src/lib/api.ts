import type { EventInput, Health, MapData, ParsedCondition, PlanStatus, World } from "./types";

// Backend base URL, inlined at build time by next.config.ts. Empty means same origin: on Vercel
// the API is served at /api on the dashboard's own domain. Locally it is http://localhost:8000.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Cannot reach the Aeolus API at ${API_URL}`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export type ReplanResponse = PlanStatus & { path: string; total_ms: number };

export type LiveResponse = {
  clock: { now: number; clock: string; paused: boolean; status: string; speed: number };
  revs: { plan: number; world: number; cache: number };
  last_feed_id: number;
  feed: { messages: unknown[]; live: unknown } | null;
  plan: PlanStatus | null;
  cache: PlanStatus["cache"];
};

export const api = {
  health: () => call<Health>("/api/health"),
  live: (feedSince: number, planRev: number) => call<LiveResponse>(`/api/live?feed_since=${feedSince}&plan_rev=${planRev}`),
  state: () => call<World>("/api/state"),
  plan: () => call<PlanStatus>("/api/plan"),
  generate: () => post<PlanStatus>("/api/plan/generate"),
  approve: (plan_id: string) => post<PlanStatus>("/api/plan/approve", { plan_id }),
  reject: (plan_id: string, note: string) => post<PlanStatus>("/api/plan/reject", { plan_id, note }),
  end: () => post<PlanStatus>("/api/plan/end"),
  event: (ev: EventInput) => post<ReplanResponse>("/api/events", ev),
  chatParse: (text: string) =>
    post<{ conditions: ParsedCondition[]; parser: string; problems: string[]; understood: boolean; message: string | null }>(
      "/api/chat/parse",
      { text },
    ),
  chatApply: (conditions: ParsedCondition[], text: string) =>
    post<ReplanResponse>("/api/chat/apply", {
      conditions: conditions.map((c) => ({ type: c.type, params: c.params })),
      text,
    }),
  clock: (body: { action?: "pause" | "resume"; speed?: number }) => post<{ paused: boolean; speed: number }>("/api/clock", body),
  map: () => call<MapData>("/api/map"),
  reset: () => post<PlanStatus>("/api/scenario/reset"),
  kpiHistory: () => call<{ snapshots: { id: number; taken_at: string; reason: string; summary: string }[] }>("/api/kpis/history"),
};
