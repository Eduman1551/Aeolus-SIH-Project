"""Fictional theatre geometry and map layers for the ops-room map.

Nothing here is real geography: the coastline, river, ridges and sector names are invented,
and coordinates are the same km grid the planner uses (x east, y south).
"""

from __future__ import annotations

from app.fusion.world import WorldState

BOUNDS = {"width": 1100, "height": 820}

# land polygon; everything outside it (the north-east) is sea
COAST = [(0, 0), (470, 0), (520, 40), (575, 55), (610, 30), (690, 70), (760, 40), (830, 95), (905, 70),
         (980, 110), (1040, 80), (1100, 105), (1100, 820), (0, 820)]
RIVER = [(330, 820), (300, 690), (340, 560), (300, 470), (380, 300), (470, 200), (560, 120), (575, 55)]
RIDGES = [
    [(700, 470), (760, 430), (830, 450), (890, 410), (960, 430)],
    [(60, 560), (120, 520), (180, 545), (240, 500)],
    [(560, 640), (640, 610), (720, 640), (800, 600)],
]
SECTORS = [
    {"name": "SECTOR KILO", "x": 140, "y": 260},
    {"name": "SECTOR LIMA", "x": 760, "y": 210},
    {"name": "SECTOR MIKE", "x": 140, "y": 770},
    {"name": "SECTOR NOVEMBER", "x": 760, "y": 770},
]
SECTOR_LINES = [[(550, 0), (550, 820)], [(0, 420), (1100, 420)]]

LOW_CEILING_FT = 3000
LOW_VIS_KM = 5.0


def _windows(segs) -> list[tuple[int, int, list]]:
    """Merge back-to-back segments into windows."""
    out: list[tuple[int, int, list]] = []
    for s in sorted(segs, key=lambda w: w.start):
        if out and s.start <= out[-1][1]:
            st, en, items = out[-1]
            out[-1] = (st, max(en, s.end), items + [s])
        else:
            out.append((s.start, s.end, [s]))
    return out


def map_layers(ws: WorldState) -> dict:
    places = {**{b.id: b for b in ws.bases.values()}, **{z.id: z for z in ws.zones.values()}}

    cells = []
    for loc, place in places.items():
        bad = [w for w in ws.weather if w.location_id == loc
               and (w.kind == "closure" or w.ceiling_ft < LOW_CEILING_FT or w.vis_km < LOW_VIS_KM)]
        for i, (start, end, items) in enumerate(_windows(bad)):
            closed = any(w.kind == "closure" for w in items)
            cells.append({
                "id": f"{loc}-wx{i}", "location_id": loc, "x": place.x_km, "y": place.y_km,
                "radius": 55 if loc in ws.zones else 45, "start": start, "end": end,
                "severity": "closed" if closed else "low cloud",
                "ceiling_ft": min(w.ceiling_ft for w in items), "vis_km": min(w.vis_km for w in items),
                "note": "closed by weather" if closed else items[0].note,
            })

    threats = []
    for t in ws.threats:
        z = ws.zones.get(t.zone_id)
        if z:
            threats.append({"id": t.id, "zone_id": t.zone_id, "x": z.x_km, "y": z.y_km, "level": t.level,
                            "radius": 30 + 30 * t.level, "start": t.start, "end": t.end, "note": t.note})

    restrictions = []
    for r in ws.restrictions:
        z = ws.zones.get(r.zone_id)
        if z:
            restrictions.append({"id": r.id, "zone_id": r.zone_id, "x": z.x_km, "y": z.y_km, "radius": 75,
                                 "start": r.start, "end": r.end, "reason": r.reason})

    return {
        "bounds": BOUNDS,
        "coast": COAST,
        "river": RIVER,
        "ridges": RIDGES,
        "sectors": SECTORS,
        "sector_lines": SECTOR_LINES,
        "bases": [{"id": b.id, "name": b.name, "wing": b.wing, "x": b.x_km, "y": b.y_km} for b in ws.bases.values()],
        "zones": [{"id": z.id, "name": z.name, "x": z.x_km, "y": z.y_km} for z in ws.zones.values()],
        "threats": threats,
        "weather_cells": cells,
        "restrictions": restrictions,
    }
