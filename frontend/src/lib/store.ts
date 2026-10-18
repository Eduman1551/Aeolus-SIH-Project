"use client";

import { create } from "zustand";
import { api, ApiError, type ReplanResponse } from "./api";
import { PATH_LABEL, secs, sortieKey } from "./format";
import type { EventInput, FeedMsg, Health, ParsedCondition, PlanStatus, World } from "./types";

export type Tab = "chat" | "events" | "changes" | "validation";
export type WsState = "connecting" | "open" | "closed";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export type ChatMsg =
  | { id: number; role: "planner"; text: string }
  | { id: number; role: "system"; text: string; tone?: "info" | "error" }
  | {
      id: number;
      role: "preview";
      text: string;
      parser: string;
      conditions: ParsedCondition[];
      problems: string[];
      state: "pending" | "applied" | "cancelled";
    }
  | { id: number; role: "result"; text: string; badge: string; summary: string; planId: string };

interface Busy {
  label: string;
  startedAt: number;
}

interface Live {
  telemetry: Record<string, { fuel_pct: number; position: string; last_report: string | null }>;
  observations: Record<string, { ceiling_ft: number; vis_km: number; at: string }>;
  checkedIn: string[];
}

interface State {
  world: World | null;
  plan: PlanStatus | null;
  health: Health | null;
  feed: FeedMsg[];
  live: Live;
  ws: WsState;
  unreachable: string | null;
  busy: Busy | null;
  view: "proposal" | "active";
  tab: Tab;
  highlight: { keys: string[]; until: number };
  toasts: Toast[];
  chat: ChatMsg[];
  resultBadge: { text: string; tone: "ok" | "warn"; at: number } | null;
  endedOpen: boolean;

  setTab: (t: Tab) => void;
  setView: (v: "proposal" | "active") => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  setWs: (s: WsState) => void;
  applyClock: (now: number, paused: boolean, status?: string) => void;
  applyFeed: (msgs: FeedMsg[], live?: { telemetry: Live["telemetry"]; observations: Live["observations"]; checked_in: string[] }) => void;
  setPlan: (p: PlanStatus, fromWs?: boolean) => void;
  closeEnded: () => void;

  refreshWorld: () => Promise<void>;
  refreshAll: () => Promise<void>;
  generate: () => Promise<void>;
  approve: () => Promise<void>;
  reject: (note: string) => Promise<void>;
  injectEvent: (ev: EventInput, label: string) => Promise<boolean>;
  chatSend: (text: string) => Promise<void>;
  chatConfirm: (msgId: number) => Promise<void>;
  chatCancel: (msgId: number) => void;
  endPlan: () => Promise<void>;
  reset: () => Promise<void>;
  togglePause: () => Promise<void>;
}

let seq = 1;
const nextId = () => seq++;

function changedKeys(p: PlanStatus | null): string[] {
  const prop = p?.proposal;
  if (!prop) return [];
  return prop.changes.filter((c) => c.new).map((c) => `${c.mission_id}/${c.new!.aircraft_id}`);
}

export const useStore = create<State>((set, get) => {
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    if (get().busy) return null;
    set({ busy: { label, startedAt: performance.now() } });
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      if (e instanceof ApiError && e.status === 0) set({ unreachable: msg });
      get().toast("error", msg);
      return null;
    } finally {
      set({ busy: null });
    }
  }

  function afterReplan(r: ReplanResponse, what: string) {
    get().setPlan(r);
    const lr = r.last_result;
    if (lr) {
      const text = `${what} in ${secs(lr.total_ms)} · ${PATH_LABEL[lr.path] ?? lr.path} · ${lr.changed} of ${lr.total} changed${
        lr.added ? ` · ${lr.added} added` : ""
      }`;
      set({ resultBadge: { text, tone: lr.publishable ? "ok" : "warn", at: Date.now() } });
    }
    set({ tab: "changes", view: "proposal" });
    get().refreshWorld();
  }

  return {
    world: null,
    plan: null,
    health: null,
    feed: [],
    live: { telemetry: {}, observations: {}, checkedIn: [] },
    ws: "connecting",
    unreachable: null,
    busy: null,
    view: "proposal",
    tab: "events",
    highlight: { keys: [], until: 0 },
    toasts: [],
    chat: [],
    resultBadge: null,
    endedOpen: false,

    setTab: (tab) => set({ tab }),
    setView: (view) => set({ view }),
    toast: (kind, text) => {
      const id = nextId();
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
      setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 4000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setWs: (ws) => set({ ws }),
    applyClock: (now, paused, status) =>
      set((s) => {
        if (!s.plan) return {};
        const plan = { ...s.plan, now, paused, status: (status as PlanStatus["status"]) ?? s.plan.status };
        return { plan };
      }),
    applyFeed: (msgs, live) =>
      set((s) => ({
        feed: [...msgs.slice().reverse(), ...s.feed].slice(0, 120),
        live: live
          ? { telemetry: live.telemetry, observations: live.observations, checkedIn: live.checked_in }
          : s.live,
      })),
    setPlan: (p) => {
      const prev = get().plan;
      const prevProp = prev?.proposal?.id;
      const update: Partial<State> = { plan: p, unreachable: null };
      if (p.proposal && p.proposal.id !== prevProp) {
        update.highlight = { keys: changedKeys(p), until: Date.now() + 6000 };
        update.view = "proposal";
      }
      if (!p.proposal && p.active && prev?.proposal) {
        update.view = "active";
        update.highlight = { keys: changedKeys(prev), until: Date.now() + 5000 };
      }
      if (p.ended && !prev?.ended) update.endedOpen = true;
      set(update);
    },
    closeEnded: () => set({ endedOpen: false }),

    refreshWorld: async () => {
      try {
        const world = await api.state();
        set((s) => ({ world, feed: s.feed.length ? s.feed : world.feed, unreachable: null }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) set({ unreachable: e.message });
      }
    },
    refreshAll: async () => {
      try {
        const [world, plan, health] = await Promise.all([api.state(), api.plan(), api.health()]);
        set({ world, plan, health, feed: world.feed, unreachable: null });
      } catch (e) {
        set({ unreachable: e instanceof Error ? e.message : String(e) });
      }
      api.health().then((health) => set({ health })).catch(() => undefined);
    },

    generate: async () => {
      const r = await run("Generating initial plan", () => api.generate());
      if (!r) return;
      get().setPlan(r);
      const p = r.proposal;
      if (p) {
        set({
          resultBadge: {
            text: `Planned in ${secs(p.timing.total_ms)} · ${p.plan.sorties.length} sorties · ${p.validation.violations.length} violations`,
            tone: p.publishable ? "ok" : "warn",
            at: Date.now(),
          },
          tab: "changes",
        });
      }
      get().toast("success", "Initial plan ready for review");
    },
    approve: async () => {
      const id = get().plan?.proposal?.id;
      if (!id) return;
      const r = await run("Publishing plan", () => api.approve(id));
      if (!r) return;
      get().setPlan(r);
      set({ view: "active" });
      get().toast("success", `Plan ${id} approved and published`);
    },
    reject: async (note) => {
      const id = get().plan?.proposal?.id;
      if (!id) return;
      const r = await run("Re-solving after reject", () => api.reject(id, note));
      if (!r) return;
      const lr = r.last_result;
      get().setPlan(r);
      if (lr) {
        set({
          resultBadge: {
            text: `Re-solved in ${secs(lr.total_ms)} · ${lr.changed} of ${lr.total} changed vs active`,
            tone: lr.publishable ? "ok" : "warn",
            at: Date.now(),
          },
        });
      }
      get().toast("info", `Plan ${id} rejected. New alternative ready for review.`);
      get().refreshWorld();
    },
    injectEvent: async (ev, label) => {
      const r = await run(`Replanning: ${label}`, () => api.event(ev));
      if (!r) return false;
      afterReplan(r, r.path === "cache hit" ? "Served" : "Replanned");
      if (r.path === "no plan") get().toast("info", "Event recorded. Generate a plan to see its effect.");
      return true;
    },
    chatSend: async (text) => {
      set((s) => ({ chat: [...s.chat, { id: nextId(), role: "planner", text }] }));
      const r = await run("Reading your conditions", () => api.chatParse(text));
      if (!r) {
        set((s) => ({ chat: [...s.chat, { id: nextId(), role: "system", tone: "error", text: "Could not read that. Is the API running?" }] }));
        return;
      }
      if (!r.understood) {
        set((s) => ({
          chat: [...s.chat, { id: nextId(), role: "system", tone: "info", text: r.message ?? "Not understood." }],
        }));
        return;
      }
      set((s) => ({
        chat: [
          ...s.chat,
          {
            id: nextId(),
            role: "preview",
            text,
            parser: r.parser,
            conditions: r.conditions,
            problems: r.problems,
            state: "pending",
          },
        ],
      }));
    },
    chatConfirm: async (msgId) => {
      const msg = get().chat.find((m) => m.id === msgId);
      if (!msg || msg.role !== "preview" || msg.state !== "pending") return;
      const r = await run("Applying conditions and replanning", () => api.chatApply(msg.conditions, msg.text));
      if (!r) return;
      set((s) => ({
        chat: s.chat.map((m) => (m.id === msgId && m.role === "preview" ? { ...m, state: "applied" } : m)),
      }));
      afterReplan(r, "Replanned");
      const p = r.proposal;
      if (p) {
        const lr = r.last_result!;
        set((s) => ({
          chat: [
            ...s.chat,
            {
              id: nextId(),
              role: "result",
              text: "Plan updated for your conditions. Review it in Plan changes.",
              badge: `${secs(lr.total_ms)} · ${PATH_LABEL[lr.path] ?? lr.path} · ${lr.changed} of ${lr.total} changed${lr.added ? ` · ${lr.added} added` : ""}`,
              summary: p.summary,
              planId: p.id,
            },
          ],
        }));
      } else {
        set((s) => ({
          chat: [...s.chat, { id: nextId(), role: "system", tone: "info", text: "Conditions recorded. Generate a plan to use them." }],
        }));
      }
    },
    chatCancel: (msgId) =>
      set((s) => ({
        chat: s.chat.map((m) => (m.id === msgId && m.role === "preview" ? { ...m, state: "cancelled" } : m)),
      })),
    endPlan: async () => {
      const r = await run("Ending plan and logging KPIs", () => api.end());
      if (!r) return;
      get().setPlan(r);
      set({ endedOpen: true });
    },
    reset: async () => {
      const r = await run("Resetting scenario", () => api.reset());
      if (!r) return;
      set({ chat: [], resultBadge: null, highlight: { keys: [], until: 0 }, view: "proposal", feed: [] });
      get().setPlan(r);
      await get().refreshWorld();
      get().toast("info", "Scenario reset to the seeded synthetic data");
    },
    togglePause: async () => {
      const paused = !!get().plan?.paused;
      try {
        const r = await api.clock(paused ? "resume" : "pause");
        get().applyClock(get().plan?.now ?? 0, r.paused);
      } catch (e) {
        get().toast("error", e instanceof Error ? e.message : String(e));
      }
    },
  };
});

export function isHighlighted(keys: string[], until: number, s: { mission_id: string; aircraft_id: string }) {
  return Date.now() < until && keys.includes(sortieKey(s));
}
