"""Wires the optional layers (prediction, contingency cache, fragility, LLM) into the orchestrator."""

from __future__ import annotations

from app.config import Settings
from app.planning.orchestrator import Planner


class AeolusPlanner(Planner):
    pass


def build_planner(settings: Settings, store=None, notify=None) -> AeolusPlanner:
    return AeolusPlanner(settings, store, notify)
