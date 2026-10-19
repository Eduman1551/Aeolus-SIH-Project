"use client";

import { api } from "./api";
import { useStore } from "./store";

// Live updates by short HTTP polling of /api/live (works on serverless hosts, where WebSockets
// are not available). Each poll returns the clock, new feed messages, the plan when it changed,
// and revisions that tell us when to refetch the world.
const POLL_MS = 2000;
const HIDDEN_POLL_MS = 6000; // slower while the tab is in the background
// failed polls back off, then give up and show "Offline" (Retry or a good health check restarts)
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000];
// a first answer slower than this means a sleeping server is starting: say so instead of failing
const WAKING_AFTER_MS = 4000;

let restart: (() => void) | null = null;

/** Start polling again after the client gave up (Offline). */
export function retryLive() {
  restart?.();
}

export function connectLive(): () => void {
  let stopped = false;
  let running = false;
  let attempt = 0;
  let firstFail = 0;
  let connected = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let feedSince = 0;
  let planRev = -1;
  let worldRev = -1;

  const later = (ms: number) => {
    if (stopped) return;
    timer = setTimeout(poll, ms);
  };

  const poll = async () => {
    if (stopped || running) return;
    running = true;
    const st = useStore.getState();
    if (!connected) {
      st.setWs(firstFail && Date.now() - firstFail > WAKING_AFTER_MS ? "waking" : "connecting");
      // still waiting on the very first answer after a few seconds: the server is waking up
      wakeTimer = setTimeout(() => !connected && useStore.getState().setWs("waking"), WAKING_AFTER_MS);
    }
    try {
      const r = await api.live(feedSince, planRev);
      if (wakeTimer) clearTimeout(wakeTimer);
      const s = useStore.getState();
      const wasConnected = connected;
      connected = true;
      attempt = 0;
      firstFail = 0;
      s.setWs("open");
      if (r.plan) s.setPlan(r.plan, true);
      else if (s.plan) {
        s.applyClock(r.clock.now, r.clock.paused, r.clock.status, r.clock.speed);
        if (r.cache) useStore.setState({ plan: { ...useStore.getState().plan!, cache: r.cache } });
      }
      if (r.feed && feedSince) s.applyFeed(r.feed.messages as never, r.feed.live as never);
      feedSince = r.last_feed_id;
      planRev = r.revs.plan;
      if (!wasConnected) {
        worldRev = r.revs.world;
        s.refreshAll();
      } else if (r.revs.world !== worldRev) {
        worldRev = r.revs.world;
        s.refreshWorld();
      }
      running = false;
      later(document.hidden ? HIDDEN_POLL_MS : POLL_MS);
    } catch {
      if (wakeTimer) clearTimeout(wakeTimer);
      running = false;
      connected = false;
      if (!firstFail) firstFail = Date.now();
      if (attempt >= BACKOFF_MS.length) {
        useStore.getState().setWs("offline");
        return;
      }
      useStore.getState().setWs(Date.now() - firstFail > WAKING_AFTER_MS ? "waking" : "connecting");
      later(BACKOFF_MS[attempt++]);
    }
  };

  const onVisible = () => {
    // coming back to the tab: poll now instead of waiting for the slow background timer
    if (!document.hidden && connected && !running) {
      if (timer) clearTimeout(timer);
      poll();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  restart = () => {
    if (stopped || running) return;
    if (timer) clearTimeout(timer);
    attempt = 0;
    firstFail = 0;
    poll();
  };

  poll();
  return () => {
    stopped = true;
    restart = null;
    if (timer) clearTimeout(timer);
    if (wakeTimer) clearTimeout(wakeTimer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
