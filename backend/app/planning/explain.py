"""Deterministic explanations built only from solver output, diff facts and raw-data rule checks.

Every change in a diff gets a reason. The LLM layer may reword the summary, never these facts.
"""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel

from app.fusion.schema import Plan, Sortie
from app.fusion.world import WorldState, fmt_min
from app.solver.feasibility import Feasibility
from app.solver.stability import match_sorties
from app.validator import check_sortie


class SortieView(BaseModel):
    aircraft_id: str
    crew_id: str
    takeoff: int
    landing: int


class Change(BaseModel):
    id: str
    kind: str  # aircraft_swap | crew_swap | retimed | removed | added
    mission_id: str
    mission_name: str
    priority: int
    old: SortieView | None = None
    new: SortieView | None = None
    reason: str
    facts: list[str] = []


def _view(s: Sortie | None) -> SortieView | None:
    if s is None:
        return None
    return SortieView(aircraft_id=s.aircraft_id, crew_id=s.crew_id, takeoff=s.takeoff, landing=s.landing)


BLOCKER_TEXT = {
    "window passed": "its take-off window has already passed",
    "horizon": "it would land after the end of the planning day",
    "out of range": "no base has a suitable aircraft type within range",
    "aircraft unserviceable": "every suitable aircraft is unserviceable",
    "aircraft unavailable": "every suitable aircraft is down or in maintenance during the window",
    "base weather": "base weather is below minimums for every possible take-off or landing time",
    "target weather": "target weather is below mission minimums for the whole window",
    "restricted airspace": "the target zone is restricted for the whole window",
    "threat level": "the zone threat level is above what suitable aircraft may enter",
    "no crew on duty": "no qualified crew is on duty for the window",
}


def unassigned_reason(ws: WorldState, plan: Plan, mission_id: str, feas: Feasibility | None) -> str:
    m = ws.missions[mission_id]
    if m.status != "open":
        return "Mission cancelled."
    cands = feas.candidates.get(mission_id, []) if feas else []
    if not cands:
        blockers = feas.blockers.get(mission_id, {}) if feas else {}
        if not blockers:
            return "No aircraft and crew combination can fly this mission."
        top = max(sorted(blockers), key=lambda k: blockers[k])
        return f"Cannot be flown: {BLOCKER_TEXT.get(top, top)}."
    # feasible on its own, so other missions hold the resources it needs
    r = ws.rules
    busy_a: dict[str, list[Sortie]] = defaultdict(list)
    busy_c: dict[str, list[Sortie]] = defaultdict(list)
    for s in plan.sorties:
        busy_a[s.aircraft_id].append(s)
        busy_c[s.crew_id].append(s)
    blocking: set[str] = set()
    weapons_short: set[str] = set()
    used_stock: dict[tuple[str, str], int] = defaultdict(int)
    for s in plan.sorties:
        for w, q in s.loadout.items():
            used_stock[(ws.aircraft[s.aircraft_id].base_id, w)] += q
    for c in cands:
        a = ws.aircraft[c.aircraft_id]
        ta = ws.aircraft_types[a.type_id].turnaround_min
        load = ws.mission_types[m.type_id].loadouts.get(a.type_id, {})
        for w, q in load.items():
            if used_stock[(a.base_id, w)] + q * m.aircraft_required > ws.stock_of(a.base_id, w):
                weapons_short.add(f"{w} at {a.base_id}")
        for t in c.starts:
            for s in busy_a[c.aircraft_id]:
                o_ta = ws.aircraft_types[ws.aircraft[s.aircraft_id].type_id].turnaround_min
                if t < s.landing + o_ta and s.takeoff < t + m.duration_min + ta:
                    blocking.add(s.mission_id)
            for s in busy_c[c.crew_id]:
                if t - r.brief_min < s.landing + r.debrief_min and s.takeoff - r.brief_min < t + m.duration_min + r.debrief_min:
                    blocking.add(s.mission_id)
    parts = []
    if blocking:
        ranked = sorted(blocking, key=lambda x: (ws.missions[x].priority, x))[:4]
        tags = ", ".join(f"{x} (P{ws.missions[x].priority})" for x in ranked)
        parts.append(f"suitable aircraft and crews are tasked on {tags} in this window")
    if weapons_short:
        parts.append(f"not enough {', '.join(sorted(weapons_short))} left")
    if not parts:
        parts.append("covering it would break duty-hour or stock limits elsewhere")
    return f"Not assigned (P{m.priority}): " + "; ".join(parts) + "."


def fill_unassigned_reasons(ws: WorldState, plan: Plan, feas: Feasibility | None) -> None:
    for u in plan.unassigned:
        u.reason = unassigned_reason(ws, plan, u.mission_id, feas)


def _aircraft_note(ws: WorldState, aid: str, svc: dict[str, float]) -> str:
    a = ws.aircraft[aid]
    p = svc.get(aid)
    tail = f", {round(p * 100)}% serviceability" if p is not None else ""
    return f"{aid} ({ws.aircraft_types[a.type_id].name}, {a.base_id}{tail})"


def build_diff(ws: WorldState, old: Plan | None, new: Plan, trigger: str, now: float,
               feas: Feasibility | None, svc: dict[str, float] | None = None) -> list[Change]:
    svc = svc or {}
    changes: list[Change] = []
    new_use_a = {s.aircraft_id: s for s in new.sorties}
    new_use_c = {s.crew_id: s for s in new.sorties}
    unassigned_new = {u.mission_id: u.reason for u in new.unassigned}
    old_missions = set(old.by_mission()) if old else set()

    for pair in match_sorties(old, new):
        kind = pair.kind
        if kind == "same":
            continue
        mid = pair.mission_id
        m = ws.missions.get(mid)
        name, prio = (m.name, m.priority) if m else (mid, 4)
        o, n = pair.old, pair.new
        facts: list[str] = []
        old_issues = check_sortie(ws, o, now) if o else []
        for v in old_issues:
            facts.append(f"{v.rule}: {v.message}")
        a_issue = next((v for v in old_issues if v.rule in ("aircraft_serviceable", "weather_base", "aircraft_range",
                                                             "threat_tolerance")), None)
        c_issue = next((v for v in old_issues if v.rule in ("crew_availability", "crew_qualified")), None)
        t_issue = next((v for v in old_issues if v.rule in ("weather_target", "restricted_zone", "weather_base",
                                                             "takeoff_window")), None)

        if kind == "aircraft_swap":
            if a_issue:
                why = f"{o.aircraft_id} can no longer fly it: {a_issue.message}."
            elif o.aircraft_id in new_use_a and new_use_a[o.aircraft_id].mission_id != mid:
                other = new_use_a[o.aircraft_id].mission_id
                why = (f"{o.aircraft_id} moved to {other} (P{ws.missions[other].priority}), "
                       f"which needs it after: {trigger}.")
            elif svc.get(n.aircraft_id, 0) > svc.get(o.aircraft_id, 1) + 0.05:
                why = (f"Lower maintenance risk: {o.aircraft_id} {round(svc[o.aircraft_id] * 100)}% vs "
                       f"{n.aircraft_id} {round(svc[n.aircraft_id] * 100)}% serviceability.")
            else:
                why = f"Reshuffled so the plan stays feasible after: {trigger}."
            if o.crew_id != n.crew_id:
                why += f" Crew {n.crew_id} flies it instead of {o.crew_id} (qualified and on duty at {ws.aircraft[n.aircraft_id].base_id})."
            reason = f"{why} Replacement: {_aircraft_note(ws, n.aircraft_id, svc)}."
        elif kind == "crew_swap":
            if c_issue:
                why = f"Crew {o.crew_id} can no longer fly it: {c_issue.message}."
            elif o.crew_id in new_use_c and new_use_c[o.crew_id].mission_id != mid:
                other = new_use_c[o.crew_id].mission_id
                why = f"Crew {o.crew_id} moved to {other} (P{ws.missions[other].priority})."
            else:
                why = f"Crew reshuffled after: {trigger}."
            reason = f"{why} Crew {n.crew_id} takes over on {n.aircraft_id}."
        elif kind == "retimed":
            move = f"Take-off moved {fmt_min(o.takeoff)} to {fmt_min(n.takeoff)}"
            if t_issue:
                reason = f"{move}: old time breaks a rule ({t_issue.message})."
            else:
                reason = f"{move} to fit around: {trigger}."
        elif kind == "removed":
            if m is None or m.status != "open":
                reason = "Mission cancelled, sortie released."
            elif mid in unassigned_new:
                reason = f"Mission dropped. {unassigned_new[mid]}"
                if old_issues:
                    reason = f"Mission dropped. Old assignment breaks a rule ({old_issues[0].message}). {unassigned_new[mid]}"
            else:
                reason = f"Sortie released after: {trigger}."
        else:  # added
            if m is not None and m.origin != "tasking order" and mid not in old_missions:
                reason = (f"New P{prio} mission ({m.origin}). Assigned {_aircraft_note(ws, n.aircraft_id, svc)} with "
                          f"crew {n.crew_id}, take-off {fmt_min(n.takeoff)}.")
            elif mid not in old_missions:
                reason = (f"Now covered (P{prio}): resources freed after {trigger}. "
                          f"Assigned {n.aircraft_id} with crew {n.crew_id} at {fmt_min(n.takeoff)}.")
            else:
                reason = f"Extra aircraft for {mid}: {n.aircraft_id} with crew {n.crew_id}."
        changes.append(Change(id=f"c{len(changes) + 1}", kind=kind, mission_id=mid, mission_name=name, priority=prio,
                              old=_view(o), new=_view(n), reason=reason, facts=facts))
    return changes


def summarise(changes: list[Change], stability: dict, trigger: str, unassigned: int) -> str:
    if not changes:
        return f"No assignment changes needed after: {trigger}. {unassigned} mission(s) remain unassigned overall."
    kinds = defaultdict(int)
    for c in changes:
        kinds[c.kind] += 1
    label = {"aircraft_swap": "aircraft swaps", "crew_swap": "crew swaps", "retimed": "re-timed",
             "removed": "sorties dropped", "added": "sorties added"}
    bits = ", ".join(f"{v} {label[k]}" for k, v in sorted(kinds.items()))
    dropped = sorted({c.mission_id for c in changes if c.kind == "removed"})
    newly = f" Newly dropped missions: {', '.join(dropped)}." if dropped else " No mission was dropped by this change."
    return (f"After {trigger}: {bits}. {stability['total'] - stability['changed']} of {stability['total']} "
            f"existing sorties unchanged ({stability['stability_pct']}% stable).{newly} "
            f"{unassigned} mission(s) remain unassigned overall.")
