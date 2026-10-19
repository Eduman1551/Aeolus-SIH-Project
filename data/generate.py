"""Generate the synthetic Aeolus dataset (deterministic for a given seed).

Every name, aircraft type, base and number here is fictional. Each output file
stands in for one source system so the fusion layer has something to merge:

  fleet.json     fleet management system      (aircraft types, airframes)
  crews.json     crew rostering system        (crews, qualifications, shifts)
  armament.json  armament / logistics system  (weapon types, stock per base)
  airspace.json  airspace control cell        (bases, zones, restrictions)
  weather.json   met office                   (hourly forecast per base/zone)
  intel.json     intelligence cell            (threat levels per zone)
  tasking.json   tasking order                (mission types, missions)
  rules.json     planning rules               (brief/debrief, horizon)

Usage: python data/generate.py [--seed 2026]
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent


def hm(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


AIRCRAFT_TYPES = [
    # id, name, role, radius, turnaround, min ceiling, min vis, max threat, vulnerability, wx sensitivity
    ("ARC", "Arcus", "multirole fighter", 700, 60, 500, 1.5, 3, 1, 0),
    ("SKR", "Skarn", "strike / SEAD", 600, 90, 800, 2.0, 3, 2, 1),
    ("NOC", "Nocta", "ISR", 950, 75, 600, 2.0, 2, 3, 1),
    ("TRV", "Travan", "tactical transport", 1200, 120, 400, 1.0, 1, 3, 0),
]

BASES = [("B1", "Base 1 Corvane", 100, 400), ("B2", "Base 2 Ostrel", 420, 380)]
WINGS = {"B1": "Corvane Air Wing", "B2": "Ostrel Air Wing"}

ZONES = [
    ("Z1", "Zone 1 Kelmar Ridge", 300, 150),
    ("Z2", "Zone 2 Sarrow Coast", 520, 120),
    ("Z3", "Zone 3 Vennic Plateau", 640, 330),
    ("Z4", "Zone 4 Thallen Valley", 180, 700),
    ("Z5", "Zone 5 Orrin Expanse", 980, 240),
    ("Z6", "Zone 6 Grisk Marsh", 40, 80),
]

# airframes per base and type: (base, type, count)
FLEET = [
    ("B1", "ARC", 4), ("B1", "SKR", 3), ("B1", "NOC", 2), ("B1", "TRV", 2),
    ("B2", "ARC", 3), ("B2", "SKR", 3), ("B2", "NOC", 2), ("B2", "TRV", 1),
]
TYPE_PREFIX = {"ARC": ("AR", 101), "SKR": ("SK", 201), "NOC": ("NC", 301), "TRV": ("TV", 401)}
# radio callsign word per type (fictional), numbered per type: ARROW-01, HAMMER-01, ...
CALLSIGN_WORD = {"ARC": "ARROW", "SKR": "HAMMER", "NOC": "OWL", "TRV": "MULE"}

# crews: (base, qualified types, count)
CREWS = [
    ("B1", ["ARC"], 5), ("B1", ["SKR"], 4), ("B1", ["ARC", "SKR"], 1), ("B1", ["NOC"], 3), ("B1", ["TRV"], 3),
    ("B2", ["ARC"], 4), ("B2", ["SKR"], 4), ("B2", ["ARC", "SKR"], 1), ("B2", ["NOC"], 3), ("B2", ["TRV"], 2),
]
CALLSIGNS = [
    "Ash", "Birch", "Cinder", "Dune", "Ember", "Flint", "Gale", "Hollow", "Iris", "Jade",
    "Kite", "Lumen", "Moss", "Nettle", "Onyx", "Pike", "Quill", "Rook", "Sable", "Thorn",
    "Umber", "Vale", "Wren", "Yarrow", "Zephyr", "Alder", "Bramble", "Coral", "Drift", "Fern",
]

WEAPONS = [
    ("GB-250", "GB-250 glide bomb", "air-to-ground", ["SKR", "ARC"]),
    ("LG-500", "LG-500 laser-guided bomb", "air-to-ground", ["ARC", "SKR"]),
    ("ARM-9", "ARM-9 anti-radiation missile", "suppression", ["SKR"]),
    ("AAM-L", "AAM-L long-range air-to-air missile", "air-to-air", ["ARC"]),
    ("AAM-S", "AAM-S short-range air-to-air missile", "air-to-air", ["ARC", "SKR"]),
]
STOCK = {
    "B1": {"GB-250": 12, "LG-500": 4, "ARM-9": 4, "AAM-L": 8, "AAM-S": 8},
    "B2": {"GB-250": 8, "LG-500": 4, "ARM-9": 4, "AAM-L": 6, "AAM-S": 6},
}

MISSION_TYPES = [
    # id, name, eligible types, loadouts, target min ceiling, target min vis
    ("STRIKE", "Strike", ["SKR", "ARC"], {"SKR": {"GB-250": 4}, "ARC": {"LG-500": 2}}, 2000, 5.0),
    ("SEAD", "Suppression of air defences", ["SKR"], {"SKR": {"ARM-9": 2}}, 1000, 3.0),
    ("CAP", "Combat air patrol", ["ARC"], {"ARC": {"AAM-L": 2, "AAM-S": 2}}, 0, 0.0),
    ("ISR", "Reconnaissance", ["NOC"], {"NOC": {}}, 2500, 5.0),
    ("AIRLIFT", "Airlift / resupply", ["TRV"], {"TRV": {}}, 1000, 3.0),
]

MISSIONS = [
    # id, name, type, priority, zone, window start, window end, duration, aircraft
    ("M01", "Dawn CAP Kelmar", "CAP", 1, "Z1", "07:30", "07:30", 180, 2),
    ("M02", "Strike Vennic depot", "STRIKE", 1, "Z3", "09:00", "09:30", 150, 2),
    ("M03", "Recce Sarrow coast", "ISR", 2, "Z2", "08:00", "09:00", 240, 1),
    ("M04", "SEAD Vennic radar", "SEAD", 2, "Z3", "08:00", "08:30", 120, 2),
    ("M05", "Resupply Grisk post", "AIRLIFT", 1, "Z6", "10:00", "11:00", 180, 1),
    ("M06", "Recce Orrin", "ISR", 3, "Z5", "11:00", "12:00", 240, 1),
    ("M07", "Strike Thallen bridge", "STRIKE", 2, "Z4", "10:00", "12:00", 150, 2),
    ("M08", "CAP Sarrow", "CAP", 3, "Z2", "13:00", "13:00", 180, 2),
    ("M09", "CAP Vennic", "CAP", 1, "Z3", "15:00", "15:00", 180, 2),
    ("M10", "Strike Orrin convoy", "STRIKE", 2, "Z5", "15:30", "16:30", 150, 2),
    ("M11", "Recce Kelmar", "ISR", 4, "Z1", "14:00", "15:00", 180, 1),
    ("M12", "Resupply Thallen", "AIRLIFT", 3, "Z4", "16:00", "18:00", 180, 1),
    ("M13", "SEAD Orrin", "SEAD", 2, "Z5", "15:00", "15:30", 120, 2),
    ("M14", "Strike Grisk cache", "STRIKE", 4, "Z6", "18:30", "19:30", 120, 2),
    ("M15", "Dusk CAP Kelmar", "CAP", 3, "Z1", "20:00", "20:00", 180, 2),
]

THREATS = [("T1", "Z2", 1, "light air defence"), ("T2", "Z3", 2, "medium SAM site"),
           ("T3", "Z4", 1, "small-arms and MANPADS"), ("T4", "Z5", 2, "mobile SAM battery")]

RESTRICTIONS = [("R1", "Z4", "09:00", "11:00", "civil air corridor active")]

# scripted weather (location, start, end, ceiling, vis, note); everything else is fair with seeded noise
WEATHER_EVENTS = [
    ("Z2", "13:00", "15:00", 1800, 6.0, "low cloud over the coast"),
    ("B2", "20:00", "23:00", 700, 2.5, "evening fog bank"),
    ("Z5", "06:00", "08:00", 2200, 4.0, "morning haze"),
]


def build(seed: int) -> dict[str, dict]:
    rnd = random.Random(seed)

    types = [
        dict(id=i, name=n, role=r, radius_km=rad, turnaround_min=ta, min_ceiling_ft=mc, min_vis_km=mv,
             max_threat=mt, vulnerability=vu, weather_sensitivity=ws)
        for i, n, r, rad, ta, mc, mv, mt, vu, ws in AIRCRAFT_TYPES
    ]

    aircraft = []
    counters = {t: start for t, (_, start) in TYPE_PREFIX.items()}
    for base, t, n in FLEET:
        for _ in range(n):
            prefix = TYPE_PREFIX[t][0]
            aid = f"{prefix}-{counters[t]}"
            callsign = f"{CALLSIGN_WORD[t]}-{counters[t] - TYPE_PREFIX[t][1] + 1:02d}"
            counters[t] += 1
            aircraft.append(dict(
                id=aid, type_id=t, base_id=base, callsign=callsign, status="serviceable", unavailable=[],
                risk=dict(
                    hours_since_maint=round(rnd.uniform(20, 140), 1),
                    age_years=round(rnd.uniform(3, 18), 1),
                    faults_30d=rnd.choice([0, 0, 0, 1, 1, 2]),
                    days_since_inspection=rnd.randint(5, 40),
                    sorties_7d=rnd.randint(3, 12),
                ),
            ))
    by_id = {a["id"]: a for a in aircraft}
    # scripted condition so the scenario has scarcity and a risky airframe
    by_id["SK-202"]["status"] = "unserviceable"
    by_id["SK-202"]["unavailable"] = [dict(start=0, end=1440, reason="gearbox replacement")]
    by_id["AR-106"]["unavailable"] = [dict(start=0, end=hm("13:00"), reason="scheduled inspection")]
    by_id["SK-205"]["risk"].update(hours_since_maint=265.0, faults_30d=4, days_since_inspection=78)
    by_id["AR-103"]["risk"].update(hours_since_maint=210.0, faults_30d=3, days_since_inspection=60)

    crews = []
    idx = 0
    for base, quals, n in CREWS:
        for k in range(n):
            day_shift = (k % 2 == 0)
            crews.append(dict(
                id=f"C-{idx + 1:02d}", callsign=CALLSIGNS[idx], base_id=base, qualified_types=quals,
                duty_start=hm("06:00") if day_shift else hm("12:00"),
                duty_end=hm("18:00") if day_shift else hm("24:00"),
                max_duty_min=600, status="available", unavailable=[],
            ))
            idx += 1
    # one crew off sick for the day
    sick = rnd.choice([c for c in crews if c["qualified_types"] == ["ARC"] and c["base_id"] == "B2"])
    sick["status"] = "unavailable"
    sick["unavailable"] = [dict(start=0, end=1440, reason="medical")]

    weapons = [dict(id=i, name=n, category=c, compatible_types=t) for i, n, c, t in WEAPONS]
    stock = [dict(base_id=b, weapon_id=w, qty=q) for b, items in STOCK.items() for w, q in items.items()]

    bases = [dict(id=i, name=n, wing=WINGS[i], x_km=x, y_km=y) for i, n, x, y in BASES]
    zones = [dict(id=i, name=n, x_km=x, y_km=y) for i, n, x, y in ZONES]
    restrictions = [dict(id=i, zone_id=z, start=hm(s), end=hm(e), reason=r) for i, z, s, e, r in RESTRICTIONS]

    weather = []
    scripted = {}
    for loc, s, e, ceil, vis, note in WEATHER_EVENTS:
        for h in range(hm(s) // 60, hm(e) // 60):
            scripted[(loc, h)] = (ceil, vis, note)
    for loc in [b[0] for b in BASES] + [z[0] for z in ZONES]:
        for h in range(24):
            if (loc, h) in scripted:
                ceil, vis, note = scripted[(loc, h)]
            else:
                ceil = rnd.randrange(3500, 9000, 100)
                vis = round(rnd.uniform(7.0, 10.0), 1)
                note = "fair"
            weather.append(dict(location_id=loc, start=h * 60, end=(h + 1) * 60, ceiling_ft=ceil,
                                vis_km=vis, wind_kt=rnd.randint(4, 22), kind="forecast", note=note))

    threats = [dict(id=i, zone_id=z, level=lv, start=0, end=1440, note=n) for i, z, lv, n in THREATS]

    mission_types = [
        dict(id=i, name=n, eligible_types=el, loadouts=lo, target_min_ceiling_ft=c, target_min_vis_km=v)
        for i, n, el, lo, c, v in MISSION_TYPES
    ]
    missions = [
        dict(id=i, name=n, type_id=t, priority=p, zone_id=z, window_start=hm(ws), window_end=hm(we),
             duration_min=d, aircraft_required=k, status="open", origin="tasking order")
        for i, n, t, p, z, ws, we, d, k in MISSIONS
    ]

    def wrap(source: str, **records):
        return {"source": source, "seed": seed, "synthetic": True, **records}

    return {
        "fleet.json": wrap("fleet management system", aircraft_types=types, aircraft=aircraft),
        "crews.json": wrap("crew rostering system", crews=crews),
        "armament.json": wrap("armament and logistics system", weapon_types=weapons, stock=stock),
        "airspace.json": wrap("airspace control cell", bases=bases, zones=zones, restrictions=restrictions),
        "weather.json": wrap("met office", weather=weather),
        "intel.json": wrap("intelligence cell", threats=threats),
        "tasking.json": wrap("tasking order", mission_types=mission_types, missions=missions),
        "rules.json": wrap("planning rules", rules=dict(brief_min=60, debrief_min=30, horizon_start=hm("06:00"),
                                                        horizon_end=hm("24:00"), scenario_start=hm("06:00"),
                                                        freeze_min=30)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    files = build(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, payload in files.items():
        (args.out / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(files)} files to {args.out} (seed {args.seed})")


if __name__ == "__main__":
    main()
