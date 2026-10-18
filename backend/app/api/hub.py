"""WebSocket hub: pushes clock ticks, feed messages, plan and world updates to every dashboard."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("aeolus.ws")


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.payloads: dict[str, Any] = {}  # kind -> callable producing the message body

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def send(self, msg: dict[str, Any]) -> None:
        if not self.clients:
            return
        text = json.dumps(msg, default=str)
        dead = []
        for c in list(self.clients):
            try:
                await c.send_text(text)
            except Exception:  # noqa: BLE001
                dead.append(c)
        for c in dead:
            self.clients.discard(c)

    def notify(self, kind: str) -> None:
        """Thread-safe: build the message for `kind` and send it on the event loop."""
        if self.loop is None or not self.clients:
            return
        build = self.payloads.get(kind)
        try:
            body = build() if build else {}
        except Exception as exc:  # noqa: BLE001
            log.warning("could not build %s payload: %s", kind, exc)
            return
        msg = {"type": kind, **body}
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self.send(msg))
        else:
            asyncio.run_coroutine_threadsafe(self.send(msg), self.loop)
