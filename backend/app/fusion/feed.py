"""Simulated live feed: periodic messages from the source systems that update the WorldState.

Feed messages update live fields (telemetry, weather observations, crew check-ins, record
timestamps). They do not change planning inputs, so they never invalidate the contingency
cache on their own. Planning-relevant changes come in as events.
"""

from __future__ import annotations

import random
from itertools import count
from typing import Any

from app.fusion.schema import Plan
from app.fusion.world import WorldState, fmt_min, wall_now


class FeedSimulator:
    KINDS = ["telemetry", "telemetry", "weather_obs", "crew", "logistics", "intel"]

    def __init__(self, seed: int = 2026) -> None:
        self.rng = random.Random(seed)
        self.ids = count(1)

    def tick(self, ws: WorldState, active: Plan | None = None) -> list[dict[str, Any]]:
        msgs = []
        msgs.extend(self._crew_checkins(ws))
        kind = self.rng.choice(self.KINDS)
        msg = getattr(self, f"_{kind}")(ws, active)
        if msg:
            msgs.append(msg)
        for m in msgs:
            ws.feed_log.appendleft(m)
        return msgs

    # ---------- helpers ----------

    def _msg(self, ws: WorldState, source: str, kind: str, entity: str, text: str) -> dict[str, Any]:
        return {
            "id": next(self.ids),
            "sim_time": round(ws.now, 1),
            "clock": fmt_min(ws.now),
            "wall": wall_now(),
            "source": source,
            "kind": kind,
            "entity": entity,
            "text": text,
            "planning_relevant": False,
        }

    def _stamp(self, record) -> None:
        if record.meta:
            record.meta.updated_at = wall_now()

    # ---------- message generators ----------

    def _crew_checkins(self, ws: WorldState) -> list[dict]:
        out = []
        for c in ws.crews.values():
            if c.status == "available" and not c.checked_in and c.duty_start <= ws.now < c.duty_end:
                c.checked_in = True
                self._stamp(c)
                out.append(self._msg(ws, "crew rostering system", "crew", c.id,
                                     f"Crew {c.id} '{c.callsign}' checked in for duty at {c.base_id}"))
        return out

    def _telemetry(self, ws: WorldState, active: Plan | None) -> dict | None:
        airborne = {}
        if active:
            for s in active.sorties:
                if s.takeoff <= ws.now < s.landing:
                    airborne[s.aircraft_id] = s
        pool = list(airborne) or [a.id for a in ws.aircraft.values() if a.status == "serviceable"]
        if not pool:
            return None
        aid = self.rng.choice(sorted(pool))
        a = ws.aircraft[aid]
        if aid in airborne:
            s = airborne[aid]
            zone = ws.missions[s.mission_id].zone_id if s.mission_id in ws.missions else "?"
            frac = (ws.now - s.takeoff) / max(1, s.landing - s.takeoff)
            a.telemetry.fuel_pct = max(15, int(100 - 75 * frac))
            a.telemetry.position = f"airborne, {s.mission_id} over {zone}"
        else:
            a.telemetry.fuel_pct = 100
            a.telemetry.position = f"on ground at {a.base_id}"
        a.telemetry.last_report = wall_now()
        self._stamp(a)
        return self._msg(ws, "fleet management system", "telemetry", aid,
                         f"{aid} {a.telemetry.position}, fuel {a.telemetry.fuel_pct}%")

    def _weather_obs(self, ws: WorldState, active: Plan | None) -> dict:
        loc = self.rng.choice(sorted(list(ws.bases) + list(ws.zones)))
        seg = next((w for w in ws.weather if w.location_id == loc and w.start <= ws.now < w.end), None)
        if seg is None:
            ceiling, vis = 5000, 9.0
        elif seg.kind == "closure":
            ceiling, vis = 0, 0.0
        else:
            # observation scatters a little around the forecast, never across a minimum
            ceiling = int(seg.ceiling_ft * self.rng.uniform(0.95, 1.08) // 100 * 100)
            vis = round(min(10.0, seg.vis_km * self.rng.uniform(0.95, 1.05)), 1)
        ws.observations[loc] = {"ceiling_ft": ceiling, "vis_km": vis, "at": fmt_min(ws.now), "wall": wall_now()}
        return self._msg(ws, "met office", "weather_obs", loc,
                         f"{loc} observed ceiling {ceiling} ft, visibility {vis} km")

    def _crew(self, ws: WorldState, active: Plan | None) -> dict | None:
        on_duty = [c for c in ws.crews.values() if c.checked_in]
        if not on_duty:
            return None
        c = self.rng.choice(sorted(on_duty, key=lambda x: x.id))
        self._stamp(c)
        return self._msg(ws, "crew rostering system", "crew", c.id,
                         f"Crew {c.id} '{c.callsign}' status confirmed: {c.status}")

    def _logistics(self, ws: WorldState, active: Plan | None) -> dict:
        s = self.rng.choice(ws.stock)
        self._stamp(s)
        return self._msg(ws, "armament and logistics system", "logistics", f"{s.base_id}/{s.weapon_id}",
                         f"Stock audit {s.base_id}: {s.weapon_id} x{s.qty} confirmed")

    def _intel(self, ws: WorldState, active: Plan | None) -> dict | None:
        if not ws.threats:
            return None
        t = self.rng.choice(ws.threats)
        self._stamp(t)
        return self._msg(ws, "intelligence cell", "intel", t.zone_id,
                         f"{t.zone_id} threat level {t.level} reconfirmed ({t.note})")
