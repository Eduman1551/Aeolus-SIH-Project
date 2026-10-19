"use client";

import { create } from "zustand";
import { api, ApiError, type ReplanResponse } from "./api";
import { PATH_LABEL, secs, sortieKey } from "./format";
import type { EventInput, FeedMsg, Health, MapData, ParsedCondition, PlanStatus, Sortie, World } from "./types";

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

export interface Progress {
  reviewed: boolean;
  visitedResults: boolean;
}

const LS_KEY = "aeolus.ui.v1";
const LS_SHELL = "aeolus.shell.v1";
function saveShell(v: { sidebarCollapsed: boolean; role: string }) {
  try {
    localStorage.setItem(LS_SHELL, JSON.stringify(v));
  } catch {
    /* storage blocked: the choice just is not remembered */
  }
}
function saveLocal(progress: Progress, tips: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ progress, tips }));
  } catch {
    /* storage can be blocked; the app works without it */
  }
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
  highlight: { keys: string[]; until: number };
  toasts: Toast[];
  chat: ChatMsg[];
  resultBadge: { text: string; tone: "ok" | "warn"; at: number; path?: string; planId?: string } | null;
  endedOpen: boolean;
  selected: Sortie | null;
  progress: Progress;
  tips: Record<string, boolean>;

  sidebarCollapsed: boolean;
  role: "planner" | "commander";
  hoverMission: string | null;
  map: MapData | null;
  drawer: { kind: "aircraft" | "base" | "zone" | "crew"; id: string } | null;
  setSidebar: (collapsed: boolean, remember?: boolean) => void;
  setRole: (role: "planner" | "commander") => void;
  setHoverMission: (id: string | null) => void;
  openDrawer: (d: { kind: "aircraft" | "base" | "zone" | "crew"; id: string } | null) => void;
  refreshMap: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setSelected: (s: Sortie | null) => void;
  markProgress: (k: keyof Progress) => void;
  dismissTip: (id: string) => void;
  hydrateLocal: () => void;
  chatEditCondition: (msgId: number, index: number, cond: ParsedCondition | null) => void;

  setView: (v: "proposal" | "active") => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  setWs: (s: WsState) => void;
  applyClock: (now: number, paused: boolean, status?: string, speed?: number) => void;
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
      const text = `${what} in ${secs(lr.total_ms)}, ${lr.changed} of ${lr.total} changed${lr.added ? `, ${lr.added} added` : ""}`;
      set({ resultBadge: { text, tone: lr.publishable ? "ok" : "warn", at: Date.now(), path: PATH_LABEL[lr.path] ?? lr.path, planId: lr.plan_id } });
    }
    set({ view: "proposal" });
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
    highlight: { keys: [], until: 0 },
    toasts: [],
    chat: [],
    resultBadge: null,
    endedOpen: false,
    selected: null,
    sidebarCollapsed: false,
    role: "planner",
    hoverMission: null,
    map: null,
    drawer: null,
    setSidebar: (sidebarCollapsed, remember = true) => {
      set({ sidebarCollapsed });
      if (remember) saveShell({ sidebarCollapsed, role: get().role });
    },
    setRole: (role) => {
      set({ role });
      saveShell({ sidebarCollapsed: get().sidebarCollapsed, role });
    },
    setHoverMission: (hoverMission) => {
      if (get().hoverMission !== hoverMission) set({ hoverMission });
    },
    openDrawer: (drawer) => set({ drawer, selected: null }),
    refreshMap: async () => {
      try {
        const map = await api.map();
        set({ map });
      } catch {
        /* the map is optional; the unreachable banner covers a down API */
      }
    },
    setSpeed: async (speed) => {
      try {
        const r = await api.clock({ speed });
        const p = get().plan;
        if (p) set({ plan: { ...p, speed: r.speed } });
      } catch (e) {
        get().toast("error", e instanceof Error ? e.message : String(e));
      }
    },
    progress: { reviewed: false, visitedResults: false },
    tips: {},

    setSelected: (selected) => set(selected ? { selected, drawer: null } : { selected }),
    markProgress: (k) => {
      if (get().progress[k]) return;
      const progress = { ...get().progress, [k]: true };
      set({ progress });
      saveLocal(progress, get().tips);
    },
    dismissTip: (id) => {
      const tips = { ...get().tips, [id]: true };
      set({ tips });
      saveLocal(get().progress, tips);
    },
    hydrateLocal: () => {
      try {
        const shell = localStorage.getItem(LS_SHELL);
        if (shell) {
          const v = JSON.parse(shell);
          set({ sidebarCollapsed: !!v.sidebarCollapsed, role: v.role === "commander" ? "commander" : "planner" });
        }
      } catch {
        /* ignore */
      }
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const v = JSON.parse(raw);
          set({ progress: { reviewed: !!v.progress?.reviewed, visitedResults: !!v.progress?.visitedResults }, tips: v.tips ?? {} });
        }
      } catch {
        /* ignore */
      }
    },
    chatEditCondition: (msgId, index, cond) =>
      set((s) => ({
        chat: s.chat.map((m) => {
          if (m.id !== msgId || m.role !== "preview") return m;
          const conditions = m.conditions.slice();
          if (cond) conditions[index] = cond;
          else conditions.splice(index, 1);
          return { ...m, conditions };
        }),
      })),

    setView: (view) => set({ view }),
    toast: (kind, text) => {
      const id = nextId();
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
      setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 4000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setWs: (ws) => set({ ws }),
    applyClock: (now, paused, status, speed) =>
      set((s) => {
        if (!s.plan) return {};
        const plan = { ...s.plan, now, paused, status: (status as PlanStatus["status"]) ?? s.plan.status, speed: speed ?? s.plan.speed };
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
        get().refreshMap();
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) set({ unreachable: e.message });
      }
    },
    refreshAll: async () => {
      try {
        const [world, plan, health] = await Promise.all([api.state(), api.plan(), api.health()]);
        set({ world, plan, health, feed: world.feed, unreachable: null });
        get().refreshMap();
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
            text: `Planned in ${secs(p.timing.total_ms)}, ${p.plan.sorties.length} sorties, ${p.validation.violations.length} rule problems`,
            tone: p.publishable ? "ok" : "warn",
            at: Date.now(),
            planId: p.id,
          },
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
            text: `Found another option in ${secs(lr.total_ms)}, ${lr.changed} of ${lr.total} changed`,
            tone: lr.publishable ? "ok" : "warn",
            at: Date.now(),
            planId: lr.plan_id,
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
              badge: `Replanned in ${secs(lr.total_ms)}, ${lr.changed} of ${lr.total} changed${lr.added ? `, ${lr.added} added` : ""}`,
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
      const progress = { reviewed: false, visitedResults: false };
      set({ chat: [], resultBadge: null, highlight: { keys: [], until: 0 }, view: "proposal", feed: [], selected: null, drawer: null, progress });
      saveLocal(progress, get().tips);
      get().setPlan(r);
      await get().refreshWorld();
      get().toast("info", "Scenario reset to the seeded synthetic data");
    },
    togglePause: async () => {
      const paused = !!get().plan?.paused;
      try {
        const r = await api.clock({ action: paused ? "resume" : "pause" });
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
