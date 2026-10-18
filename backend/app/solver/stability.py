"""Matching old and new sorties, and the plan-stability metric.

Stability = share of the previous plan's sorties kept exactly (same aircraft, crew, take-off).
Sorties added for new or newly covered missions are reported separately, not as instability.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.fusion.schema import Plan, Sortie


@dataclass
class Pair:
    mission_id: str
    old: Sortie | None
    new: Sortie | None

    @property
    def kind(self) -> str:
        if self.old is None:
            return "added"
        if self.new is None:
            return "removed"
        o, n = self.old, self.new
        if (o.aircraft_id, o.crew_id, o.takeoff) == (n.aircraft_id, n.crew_id, n.takeoff):
            return "same"
        if o.aircraft_id != n.aircraft_id:
            return "aircraft_swap"
        if o.crew_id != n.crew_id:
            return "crew_swap"
        return "retimed"


def match_sorties(old: Plan | None, new: Plan) -> list[Pair]:
    old_by = old.by_mission() if old else {}
    new_by = new.by_mission()
    pairs: list[Pair] = []
    for mid in sorted(set(old_by) | set(new_by)):
        o_left = sorted(old_by.get(mid, []), key=lambda s: s.aircraft_id)
        n_left = sorted(new_by.get(mid, []), key=lambda s: s.aircraft_id)
        for key in (lambda s: (s.aircraft_id, s.crew_id, s.takeoff), lambda s: s.aircraft_id, lambda s: s.crew_id):
            for o in list(o_left):
                n = next((n for n in n_left if key(n) == key(o)), None)
                if n is not None:
                    pairs.append(Pair(mid, o, n))
                    o_left.remove(o)
                    n_left.remove(n)
        for o, n in zip(o_left, n_left, strict=False):
            pairs.append(Pair(mid, o, n))
        k = min(len(o_left), len(n_left))
        pairs.extend(Pair(mid, o, None) for o in o_left[k:])
        pairs.extend(Pair(mid, None, n) for n in n_left[k:])
    return pairs


def stability_metrics(old: Plan | None, new: Plan) -> dict:
    pairs = match_sorties(old, new)
    total_old = len(old.sorties) if old else 0
    changed = sum(1 for p in pairs if p.kind not in ("same", "added"))
    added = sum(1 for p in pairs if p.kind == "added")
    stability = 100.0 if total_old == 0 else round(100.0 * (total_old - changed) / total_old, 1)
    return {"changed": changed, "added": added, "total": total_old, "stability_pct": stability,
            "changed_pct": round(100.0 - stability, 1)}
