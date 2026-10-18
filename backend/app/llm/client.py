"""Thin LLM interface (Groq). The LLM only (a) turns planner text into structured conditions and
(b) rewords the deterministic change summary. It never creates, edits or approves a plan.

Without GROQ_API_KEY, or when the call fails, everything falls back to the offline parser and
the deterministic wording, so the demo never depends on the network.
"""

from __future__ import annotations

import json
import logging
import re
import time

from app.events.types import EventIn
from app.fusion.world import WorldState
from app.llm.offline import parse_offline

log = logging.getLogger("aeolus.llm")

CONDITION_GUIDE = """You convert an air-operations planner's message into planning conditions.
Return ONLY a JSON object: {"conditions": [{"type": ..., "params": {...}}], "unparsed": "<text you could not map>"}.
Allowed types and params (times as "HH:MM", 24h clock, scenario day):
- weather_closure: location_id (base B1/B2 or zone Z1-Z6), start, end
- zone_restriction: zone_id, start, end
- new_mission: mission_type (STRIKE|SEAD|CAP|ISR|AIRLIFT), zone_id, priority (1-4), start, optional aircraft (1-4), optional duration_min
- aircraft_down: aircraft_id, optional until
- crew_unavailable: crew_id (like C-07), optional start, end
- threat_zone: zone_id, level (0-3), optional start, end
- risk_update: aircraft_id, any of faults_30d, hours_since_maint, days_since_inspection
- cancel_mission: mission_id (like M07)
- set_priority: mission_id, priority
"Base 2" means B2, "Zone 3" means Z3. Never invent ids that are not in the lists below. If nothing fits, return an empty list."""


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:[.:]\d+)?", text))


class LLM:
    def __init__(self, api_key: str | None, model: str | None) -> None:
        self.model = model
        self.client = None
        self.last_error: str | None = None
        self.calls = 0
        if api_key and model:
            try:
                from groq import Groq

                self.client = Groq(api_key=api_key, timeout=12.0, max_retries=0)
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"groq client unavailable: {type(exc).__name__}"

    @property
    def configured(self) -> bool:
        return self.client is not None

    def status(self) -> dict:
        return {"configured": self.configured, "model": self.model if self.configured else None,
                "mode": "groq" if self.configured else "offline parser", "last_error": self.last_error}

    def _chat(self, messages: list[dict], json_mode: bool, max_tokens: int = 500) -> str:
        assert self.client is not None
        kwargs = {"model": self.model, "messages": messages, "temperature": 0.1, "max_tokens": max_tokens}
        if self.model and "gpt-oss" in self.model:
            # reasoning models: keep thinking short so the answer fits in the token budget
            kwargs["reasoning_effort"] = "low"
            kwargs["max_tokens"] = max_tokens + 600
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        for attempt in (1, 2):
            try:
                self.calls += 1
                resp = self.client.chat.completions.create(**kwargs)
                self.last_error = None
                return resp.choices[0].message.content or ""
            except Exception as exc:  # noqa: BLE001
                name = type(exc).__name__
                self.last_error = name
                if attempt == 1 and ("RateLimit" in name or "Timeout" in name or "Connection" in name):
                    time.sleep(1.5)
                    continue
                raise
        return ""

    # ---------- (a) text -> conditions ----------

    def parse(self, text: str, ws: WorldState) -> tuple[list[EventIn], str]:
        offline, _ = parse_offline(text)
        if not self.configured:
            return offline, "offline parser"
        ids = (f"Bases: {', '.join(ws.bases)}. Zones: {', '.join(ws.zones)}. Aircraft: {', '.join(sorted(ws.aircraft))}. "
               f"Crews: {', '.join(sorted(ws.crews))}. Missions: {', '.join(sorted(ws.missions))}.")
        try:
            raw = self._chat([{"role": "system", "content": CONDITION_GUIDE + "\n" + ids},
                              {"role": "user", "content": text[:800]}], json_mode=True)
            data = json.loads(raw)
            out = []
            for c in data.get("conditions", []):
                try:
                    out.append(EventIn(type=c["type"], params=c.get("params", {}), origin="planner chat"))
                except Exception:  # noqa: BLE001 - skip malformed items, keep the valid ones
                    continue
            if not out and offline:
                return offline, "offline parser (LLM found nothing)"
            return out, f"groq {self.model}"
        except Exception as exc:  # noqa: BLE001
            log.info("LLM parse failed, using offline parser: %s", type(exc).__name__)
            return offline, "offline parser (LLM unavailable)"

    # ---------- (b) reword the deterministic summary ----------

    def reword(self, summary: str, reasons: list[str]) -> str | None:
        if not self.configured:
            return None
        facts = summary + "\n" + "\n".join(f"- {r}" for r in reasons[:10])
        try:
            text = self._chat([
                {"role": "system", "content": "Rewrite the plan-change facts below as two short, plain sentences for an "
                                              "air-operations planner. Use only the facts given. Do not add any number, "
                                              "time, id or claim that is not in the facts. No preamble."},
                {"role": "user", "content": facts},
            ], json_mode=False, max_tokens=160).strip()
        except Exception:  # noqa: BLE001
            return None
        text = text.translate({0x2011: "-", 0x2010: "-", 0x2012: "-", 0x2013: "-", 0x2014: "-", 0x202F: " ",
                               0x00A0: " "})
        # guard against made-up numbers: every number in the rewording must appear in the facts
        if not text or not _numbers(text) <= _numbers(facts):
            return None
        return text
