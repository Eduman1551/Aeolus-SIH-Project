"""Replanning entry point: warm start from the current plan, lock committed sorties, penalise change."""

from __future__ import annotations

from dataclasses import replace

from app.fusion.schema import Plan
from app.fusion.world import WorldState
from app.solver.cpsat import SolveOptions, SolveResult, solve


def committed_sorties(ws: WorldState, plan: Plan | None, now: float) -> list:
    """Sorties of `plan` that take off before now + freeze window and still belong to an open mission."""
    if plan is None:
        return []
    cutoff = now + ws.rules.freeze_min
    by_m = plan.by_mission()
    out = []
    for mid, ss in by_m.items():
        m = ws.missions.get(mid)
        if m is None or m.status != "open":
            continue
        if ss[0].takeoff < cutoff:
            out.extend(ss)
    return out


def replan(ws: WorldState, previous: Plan | None, now: float, base: SolveOptions,
           stability_lambda: int) -> SolveResult:
    frozen = committed_sorties(ws, previous, now)
    opts = replace(base, previous=previous, stability_lambda=stability_lambda if previous else 0, frozen=frozen,
                   earliest=now + ws.rules.freeze_min)
    res = solve(ws, opts)
    if res.status == "INFEASIBLE" and frozen:
        # a committed sortie conflicts with the new picture; solve without locks and report it
        res = solve(ws, replace(opts, frozen=[]))
        res.stats["unlocked_committed"] = True
    if previous is not None:
        res.plan.parent_id = previous.id
    return res
