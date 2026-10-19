"use client";

import { API_URL, WS_URL } from "./api";
import { useStore } from "./store";

// Retries with backoff, then gives up and shows "Offline" (Retry or a good health check starts again).
// The budget covers a free-tier host waking from sleep (30 to 60 s).
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000];
// after this long without a connection, tell the user the server may be waking up
const WAKING_AFTER_MS = 4000;

let restart: (() => void) | null = null;

/** Try connecting again after the client gave up (Offline). */
export function retryLive() {
  restart?.();
}

// One WebSocket per page; the server pushes clock, feed, plan and world updates.
export function connectLive(): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let firstFail = 0;
  let ping: ReturnType<typeof setInterval> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (stopped) return;
    if (!API_URL && !process.env.NEXT_PUBLIC_WS_URL) {
      // no backend configured for this build, so there is nothing to connect to
      useStore.getState().setWs("offline");
      return;
    }
    const st = useStore.getState();
    st.setWs(firstFail && Date.now() - firstFail > WAKING_AFTER_MS ? "waking" : "connecting");
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      schedule();
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      firstFail = 0;
      useStore.getState().setWs("open");
      useStore.getState().refreshAll();
      ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), 20000);
    };
    socket.onmessage = (ev) => {
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const st = useStore.getState();
      switch (msg.type) {
        case "clock":
          st.applyClock(msg.now as number, msg.paused as boolean, msg.status as string, msg.speed as number);
          break;
        case "feed":
          st.applyFeed(msg.messages as never, msg.live as never);
          break;
        case "plan":
          st.setPlan(msg.plan as never, true);
          break;
        case "world":
          st.refreshWorld();
          break;
        case "cache":
          if (st.plan) useStore.setState({ plan: { ...st.plan, cache: msg.cache as never } });
          break;
      }
    };
    socket.onclose = () => {
      if (ping) clearInterval(ping);
      socket = null;
      schedule();
    };
    socket.onerror = () => socket?.close();
  };

  const schedule = () => {
    if (stopped) return;
    if (!firstFail) firstFail = Date.now();
    if (attempt >= BACKOFF_MS.length) {
      useStore.getState().setWs("offline");
      return;
    }
    useStore.getState().setWs(Date.now() - firstFail > WAKING_AFTER_MS ? "waking" : "connecting");
    timer = setTimeout(open, BACKOFF_MS[attempt++]);
  };

  restart = () => {
    if (stopped || socket) return;
    if (timer) clearTimeout(timer);
    attempt = 0;
    firstFail = 0;
    open();
  };

  open();
  return () => {
    stopped = true;
    restart = null;
    if (ping) clearInterval(ping);
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
