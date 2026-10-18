"""The 8 Aeolus KPIs, computed only from real runs. Targets are our own suggestions."""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel

from app.fusion.schema import Plan
from app.fusion.world import WorldState


class Kpi(BaseModel):
    id: str
    label: str
    value: float | None
    unit: str
    display: str
    detail: str
    baseline: str | None = None
    delta: str | None = None
    good: bool | None = None
    target: str


def _secs(ms: float) -> str:
    return f"{ms / 1000:.2f} s" if ms < 10_000 else f"{ms / 1000:.1f} s"


def coverage(ws: WorldState, plan: Plan | None, prios=(1, 2)) -> tuple[int, int]:
    missions = [m for m in ws.open_missions() if m.priority in prios]
    if plan is None:
        return 0, len(missions)
    covered = {s.mission_id for s in plan.sorties}
    return sum(1 for m in missions if m.id in covered), len(missions)


def utilisation(ws: WorldState, plan: Plan | None) -> tuple[float, float]:
    """% of serviceable aircraft and available crews that fly at least one sortie."""
    end = ws.rules.horizon_end
    serviceable = [a for a in ws.aircraft.values()
                   if a.status == "serviceable" and not any(w.start <= ws.rules.horizon_start and w.end >= end
                                                            for w in a.unavailable)]
    crews = [c for c in ws.crews.values()
             if c.status == "available" and not any(w.start <= c.duty_start and w.end >= c.duty_end
                                                    for w in c.unavailable)]
    if plan is None or not serviceable or not crews:
        return 0.0, 0.0
    used_a = {s.aircraft_id for s in plan.sorties}
    used_c = {s.crew_id for s in plan.sorties}
    return (100.0 * sum(a.id in used_a for a in serviceable) / len(serviceable),
            100.0 * sum(c.id in used_c for c in crews) / len(crews))


@dataclass
class KpiTracker:
    manual_baseline_min: int = 180
    initial_solve_ms: float | None = None
    greedy_ms: float | None = None
    replans: list[dict] = field(default_factory=list)  # {ms, path}
    stabilities: list[float] = field(default_factory=list)
    changes_total: int = 0
    changes_explained: int = 0
    approvals: int = 0
    rejections: int = 0

    def record_initial(self, solve_ms: float, greedy_ms: float) -> None:
        self.initial_solve_ms, self.greedy_ms = solve_ms, greedy_ms

    def record_replan(self, ms: float, path: str, stability_pct: float) -> None:
        self.replans.append({"ms": ms, "path": path})
        self.stabilities.append(stability_pct)

    def record_changes(self, changes: list) -> None:
        self.changes_total += len(changes)
        self.changes_explained += sum(1 for c in changes if (c.reason or "").strip())

    def compute(self, ws: WorldState, plan: Plan | None, baseline: Plan | None, violations: int | None,
                baseline_violations: int | None) -> list[Kpi]:
        k: list[Kpi] = []

        # 1 planning time
        if self.initial_solve_ms is not None:
            manual_ms = self.manual_baseline_min * 60_000
            red = 100.0 * (1 - self.initial_solve_ms / manual_ms)
            k.append(Kpi(id="planning_time", label="Planning time", value=round(self.initial_solve_ms, 1), unit="ms",
                         display=_secs(self.initial_solve_ms),
                         detail=f"{red:.2f}% faster than a {self.manual_baseline_min} min manual plan (assumed)",
                         baseline=f"greedy {_secs(self.greedy_ms or 0)} · manual {self.manual_baseline_min} min (assumed)",
                         delta=f"-{red:.1f}% vs manual", good=True, target="seconds, not hours"))
        else:
            k.append(Kpi(id="planning_time", label="Planning time", value=None, unit="ms", display="--",
                         detail="Generate a plan to measure", target="seconds, not hours"))

        # 2 replan time
        hits = [r["ms"] for r in self.replans if r["path"] == "cache hit"]
        misses = [r["ms"] for r in self.replans if r["path"] != "cache hit"]
        if self.replans:
            last = self.replans[-1]
            parts = []
            if misses:
                parts.append(f"miss {_secs(sum(misses) / len(misses))}")
            if hits:
                parts.append(f"hit {_secs(sum(hits) / len(hits))}")
            ok = (not misses or max(misses) < 10_000) and (not hits or max(hits) < 2_000)
            k.append(Kpi(id="replan_time", label="Replan time", value=round(last["ms"], 1), unit="ms",
                         display=_secs(last["ms"]), detail=f"last: {last['path']} · avg " + " · ".join(parts),
                         delta=" · ".join(parts), good=ok, target="< 10 s miss, < 2 s hit"))
        else:
            k.append(Kpi(id="replan_time", label="Replan time", value=None, unit="ms", display="--",
                         detail="No events yet", target="< 10 s miss, < 2 s hit"))

        # 3 priority coverage
        got, total = coverage(ws, plan)
        p1, p1t = coverage(ws, plan, (1,))
        pct = 100.0 * got / total if total else 100.0
        bgot, btotal = coverage(ws, baseline) if baseline else (None, None)
        bpct = 100.0 * bgot / btotal if baseline and btotal else None
        k.append(Kpi(id="priority_coverage", label="P1/P2 coverage", value=round(pct, 1), unit="%",
                     display=f"{pct:.0f}%" if plan else "--",
                     detail=f"P1 {p1}/{p1t} · P1+P2 {got}/{total}",
                     baseline=f"greedy {bpct:.0f}%" if bpct is not None else None,
                     delta=f"{pct - bpct:+.0f} pts vs greedy" if bpct is not None and plan else None,
                     good=(p1 == p1t) if plan else None, target="100% P1 when feasible"))

        # 4 violations
        k.append(Kpi(id="violations", label="Constraint violations", value=violations, unit="",
                     display=str(violations) if violations is not None else "--",
                     detail="from the independent validator", good=(violations == 0) if violations is not None else None,
                     baseline=f"greedy {baseline_violations}" if baseline_violations is not None else None,
                     target="0"))

        # 5 utilisation
        ua, uc = utilisation(ws, plan)
        util = (ua + uc) / 2
        if baseline:
            ba, bc = utilisation(ws, baseline)
            butil = (ba + bc) / 2
        k.append(Kpi(id="utilisation", label="Resource use", value=round(util, 1), unit="%",
                     display=f"{util:.0f}%" if plan else "--", detail=f"aircraft {ua:.0f}% · crews {uc:.0f}%",
                     baseline=f"greedy {butil:.0f}%" if baseline else None,
                     delta=f"{util - butil:+.0f} pts vs greedy" if baseline and plan else None,
                     good=(util >= butil) if baseline and plan else None, target="above greedy baseline"))

        # 6 stability
        if self.stabilities:
            last = self.stabilities[-1]
            avg_changed = sum(100 - s for s in self.stabilities) / len(self.stabilities)
            k.append(Kpi(id="stability", label="Plan stability", value=round(last, 1), unit="%",
                         display=f"{100 - last:.0f}% changed", detail=f"last event · avg {avg_changed:.0f}% changed",
                         good=(100 - last) < 15, target="< 15% changed per event"))
        else:
            k.append(Kpi(id="stability", label="Plan stability", value=None, unit="%", display="--",
                         detail="No events yet", target="< 15% changed per event"))

        # 7 cache hit rate
        events = [r for r in self.replans if r["path"] in ("cache hit", "cache miss", "cache stale")]
        if events:
            h = sum(1 for r in events if r["path"] == "cache hit")
            rate = 100.0 * h / len(events)
            k.append(Kpi(id="cache_hit_rate", label="Cache hit rate", value=round(rate, 1), unit="%",
                         display=f"{rate:.0f}%", detail=f"{h} of {len(events)} events served from cache",
                         good=rate >= 60, target="60%+ on modelled events"))
        else:
            k.append(Kpi(id="cache_hit_rate", label="Cache hit rate", value=None, unit="%", display="--",
                         detail="No events yet", target="60%+ on modelled events"))

        # 8 explanation coverage
        if self.changes_total:
            cov = 100.0 * self.changes_explained / self.changes_total
            k.append(Kpi(id="explanation_coverage", label="Explained changes", value=round(cov, 1), unit="%",
                         display=f"{cov:.0f}%", detail=f"{self.changes_explained} of {self.changes_total} changes have a reason",
                         good=cov == 100, target="100%"))
        else:
            k.append(Kpi(id="explanation_coverage", label="Explained changes", value=None, unit="%", display="--",
                         detail="No changes yet", target="100%"))
        return k
