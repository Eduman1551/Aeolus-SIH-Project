-- Aeolus persistence: plan history, planner decisions, events and KPI logs.
-- The live picture (WorldState, plans, cache) is kept in memory when the API runs as one server.
-- On serverless hosts it is saved in scenario_state after every change instead. Safe to run more than once.

CREATE TABLE IF NOT EXISTS plans (
    id             TEXT PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    source         TEXT NOT NULL,            -- cpsat | greedy | cache
    status         TEXT NOT NULL,            -- pending_approval | invalid | active | rejected | superseded | ended
    parent_id      TEXT,
    trigger        TEXT,
    solve_ms       DOUBLE PRECISION,
    objective      DOUBLE PRECISION,
    sorties        INTEGER,
    unassigned     INTEGER,
    violations     INTEGER,
    stability_pct  DOUBLE PRECISION,
    plan           JSONB NOT NULL,
    validation     JSONB
);
CREATE INDEX IF NOT EXISTS plans_created_idx ON plans (created_at DESC);

CREATE TABLE IF NOT EXISTS plan_decisions (
    id          BIGSERIAL PRIMARY KEY,
    plan_id     TEXT NOT NULL,
    decision    TEXT NOT NULL,               -- approved | rejected
    note        TEXT,
    decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    sim_time        DOUBLE PRECISION,
    type            TEXT NOT NULL,
    origin          TEXT,
    signature       TEXT,
    payload         JSONB NOT NULL,
    classification  JSONB,
    cache_hit       BOOLEAN,
    replan_ms       DOUBLE PRECISION,
    proposal_id     TEXT
);
CREATE INDEX IF NOT EXISTS events_received_idx ON events (received_at DESC);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    scenario_seed INTEGER,
    reason        TEXT,
    kpis          JSONB NOT NULL,
    summary       TEXT
);

CREATE TABLE IF NOT EXISTS chat_log (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    text        TEXT NOT NULL,
    parser      TEXT,
    conditions  JSONB
);

-- Whole scenario (world, plans, cache, clock) for stateless/serverless runs: one row, saved after
-- each change. `rev` guards against two requests overwriting each other.
CREATE TABLE IF NOT EXISTS scenario_state (
    id          INTEGER PRIMARY KEY,
    rev         BIGINT NOT NULL DEFAULT 0,
    data        BYTEA NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
