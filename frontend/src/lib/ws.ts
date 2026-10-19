"use client";

import { WS_URL } from "./api";
import { useStore } from "./store";

// One WebSocket per page. Reconnects with backoff; the server pushes clock, feed, plan and world updates.
export function connectLive(): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retry = 0;
  let ping: ReturnType<typeof setInterval> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (stopped) return;
    useStore.getState().setWs("connecting");
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      schedule();
      return;
    }
    socket.onopen = () => {
      retry = 0;
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
      useStore.getState().setWs("closed");
      schedule();
    };
    socket.onerror = () => socket?.close();
  };

  const schedule = () => {
    if (stopped) return;
    retry = Math.min(retry + 1, 6);
    timer = setTimeout(open, 500 * 2 ** (retry - 1));
  };

  open();
  return () => {
    stopped = true;
    if (ping) clearInterval(ping);
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
