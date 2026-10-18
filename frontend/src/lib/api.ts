import type { EventInput, Health, ParsedCondition, PlanStatus, World } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

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

export const api = {
  health: () => call<Health>("/api/health"),
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
  clock: (action: "pause" | "resume") => post<{ paused: boolean }>("/api/clock", { action }),
  reset: () => post<PlanStatus>("/api/scenario/reset"),
};
