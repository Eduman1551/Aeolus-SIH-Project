# Aeolus (Keeper of Wind): SIH 2026, PS26249

Read this whole file before writing code. Build **Version 1** of the prototype end to end, exactly as described here.

- **v1 (now):** the core system in sections 3 to 5. Nothing from the "unique feature" list.
- **v2/v3 (later, not now):** the unique feature, "Plan Resilience Score" (N-1 failure sweep + Monte Carlo mission success probability), plus "why not?" explanations, what-if sandbox, ripple view. **Do not build these in v1.** Just keep the solver a clean, callable function so v2 can loop over it.

---

## 1. What we are building

**Problem statement:** Complexity in planning and dynamically retasking air operations in a contested and rapidly changing operational environment. Information on aircraft availability, crew status, weapon loads, airspace, weather, threats and mission priorities is generated across multiple systems but is not always available through a common, real-time decision-support framework, leading to increased planning timelines and sub-optimal allocation of scarce airpower resources.

**Technology opportunity:** AI-enabled decision-support, multi-source data fusion, predictive analytics, optimisation algorithms.

**Aeolus** is an AI-enabled **decision-support** tool for air-operations planners. It does not fly or act autonomously. It:

1. **Fuses** fleet, crew, weapons, airspace, weather, threat and mission data into one real-time picture.
2. **Optimises** assignment of aircraft + crew + weapons to missions (constrained scheduling, OR-Tools CP-SAT).
3. **Replans in seconds** when something changes, minimises disruption to the existing plan, and **explains every change**.

---

## 2. Ground rules (non-negotiable)

1. **The solver is the source of truth.** The LLM only (a) turns the planner's chat text into structured conditions and (b) rewords explanations. The LLM never creates, edits or approves a plan.
2. **The validator is independent code.** It re-checks every plan from raw data and must NOT import the solver's constraint model. A plan with violations is never shown as publishable and never published.
3. **A human approves.** Nothing becomes the active plan without Approve.
4. **All data is synthetic and fictional.** Fictional aircraft types, no real military data or names. Label "SYNTHETIC DATA" in the UI and README, and list assumptions in the README.
5. **No fake numbers.** Every KPI, timing and count shown in the UI is computed from a real run. Never hardcode results.
6. **Works offline.** The LLM is optional. With no API key, a rule-based parser handles the chat so the demo never breaks.
7. **Windows first.** The developer is on Windows (PowerShell). No Makefile, no bash-only scripts. Use pnpm scripts, small Node scripts (`.mjs`) and Python scripts. Use `pathlib` for paths.
8. **Scope discipline.** Build everything in section 4. Do not build anything in section 5.

---

## 3. Architecture and flow (implement exactly this)

**Initial plan**
1. Load the synthetic "military database" (seeded JSON in `data/`) into the software.
2. **Multi-source data fusion:** merge fleet, crew, weapons, airspace, weather, threats and missions into one `WorldState` (with source tag and timestamp per record). A **simulated live feed** (script pushing updates over WebSocket) keeps it updating.
3. Planner types conditions in **chat** (or the manual conditions form). The LLM layer converts text to structured conditions, shown as a preview the planner confirms.
4. **Predictive analysis (lite)** outputs aircraft serviceability probability and weather impact, which feed the solver as penalties/inputs.
5. The **agentic layer** calls the **assignment and scheduling engine** (CP-SAT) and gets a plan plus a **stability** metric.
6. The **validator** checks the plan. Then the planner sees it and **Approves or Rejects**.
   - **Rejected:** goes back to the solver. The planner's note becomes a new manual condition ("Manually list new conditions") and it re-solves.
7. On approve, **publish** as the active plan to the dashboard.
8. **Light precomputation** runs in the background after publish: fragility score per assignment, contingency plans for the 3 to 5 likeliest events, predictive models (already trained offline).
9. **Keep monitoring** live feeds (from the fusion layer). No event: keep monitoring. Plan ends: **log KPIs**, END.

**Event path**
10. Event fires (injected via the panel or the simulated feed) and is **classified**.
11. **Check contingency cache.**
    - **Hit** (same event signature AND world state unchanged since precompute): load the cached plan and diff it against the current plan.
    - **Miss:** re-solve, warm-started from the current plan, with the stability penalty in the objective.
12. Validator runs on **every** path (hit or miss), then the planner sees **old vs new with a reason per change**, then Approve/Reject, then Publish, then refresh the precompute layer in the background.

**Module map**

| Module | Responsibility |
|---|---|
| `data/` + `backend/app/data` | seeded synthetic dataset and loader |
| `backend/app/fusion` | unified schema, `WorldState`, live-feed simulator |
| `backend/app/predict` | small scikit-learn serviceability model + weather impact rules |
| `backend/app/solver` | CP-SAT engine, greedy baseline, stability, warm start |
| `backend/app/validator` | independent rule-based checker |
| `backend/app/events` | event types, classifier, application to `WorldState` |
| `backend/app/precompute` | fragility score, contingency cache |
| `backend/app/llm` | chat to structured conditions, explanation wording, offline fallback |
| `backend/app/planning` | orchestrator and state machine: draft, pending approval, active, rejected |
| `backend/app/kpi` | KPI computation and logging |
| `backend/app/api` | FastAPI routes + WebSocket |
| `backend/db` | `schema.sql` and a small `psycopg` data-access layer (plain SQL) |
| `frontend/` | Next.js planner dashboard |

---

## 4. v1 IN SCOPE (build all of it)

| # | Feature | Done when |
|---|---|---|
| 1 | **Synthetic dataset**, seeded and deterministic: ~20 aircraft (4 fictional types, 2 bases), ~30 crews, ~15 missions over a 24h horizon, weapon stock per base, 1 to 2 bases, a few zones. Resources must be **scarce** so not every mission fits and priorities matter. | Same seed gives the same data. P1 missions are coverable in the baseline. |
| 2 | **Data fusion layer:** one unified schema + simulated live feed | UI shows incoming feed messages and the state updates live |
| 3 | **CP-SAT engine** with: aircraft serviceability, type match and range; turnaround time; crew qualification and duty-hour limits; weapon compatibility and stock; weather minimums at base and target (time windows); restricted-zone time windows; no double-booking; priority-weighted objective; threat-level risk penalty | Solves the default scenario in under ~10 s and respects all constraints |
| 4 | **Replan with stability:** warm start from the old plan, objective term `lambda x changed assignments`, stability % reported | Replan after an event changes few assignments, and `lambda` is configurable |
| 5 | **Greedy baseline planner** | Used for the planning-time and quality comparison |
| 6 | **Independent validator** (separate code, re-checks from raw data) | One unit test per rule, each with a violating plan that gets caught |
| 7 | **Event panel**: Aircraft down, New priority mission, Weather closure (base/zone), New threat zone (buttons with small forms) | Each triggers classify, cache check, replan |
| 8 | **Plan lifecycle:** generate, validate, planner Approve/Reject, publish. Reject loops back to the solver. | Visible plan status in UI |
| 9 | **Chat panel:** planner text to structured conditions (preview + confirm), then replan. Plus a short explanation of what changed. | Works with a Groq key AND with the offline fallback parser |
| 10 | **Contingency cache (simple):** precompute 3 to 5 events after each publish, serve hits instantly, invalidate when world state changes, show hit/miss + time in the UI | A hit is visibly faster than a miss |
| 11 | **Fragility score (simple):** per assignment, based on available backup aircraft/crew | Shown as a badge/colour on each Gantt bar |
| 12 | **Predictive analytics (lite):** one small scikit-learn model trained on synthetic data (serviceability probability) feeding the solver as a penalty, plus rule-based weather impact. Clearly labelled as trained on synthetic data. | Changing an aircraft's risk inputs changes the plan |
| 13 | **Explanations:** every change in a diff has a reason generated deterministically from solver/diff facts. The LLM may reword only. | Explanation coverage KPI = 100% |
| 14 | **Planner dashboard** (section 8) | Looks and feels finished |
| 15 | **All 8 KPIs live** (section 9) + "End plan" logs a KPI summary | Numbers come from real runs |
| 16 | **Tests, README, DEMO.md, smoke script** | See sections 10 and 11 |

---

## 5. OUT OF SCOPE for v1 (future scope; do NOT build, only list in the README "Future scope")

- Real military database integration, secure data pipelines, true multi-source ingestion with real protocols
- Full constraint depth: airspace deconfliction, route planning, detailed turnaround modelling, detailed rest rules
- Real event detection from live sensors and feeds
- Advanced incremental solving, multi-objective tuning
- Formal verification, certification-grade validation
- Map view with threat zones and routes, role-based access, multi-user collaboration
- Audit trail and after-action review module
- Full agentic orchestration and autonomous replanning
- Dynamic cache refresh strategy beyond the simple rebuild-after-publish, a full event library
- Learned robustness scoring
- Trained models on real maintenance/weather data, calibrated and validated
- Long-run KPI benchmarking at scale
- **The unique v2 feature** (Plan Resilience Score: N-1 sweep + Monte Carlo), "why not?" Q&A, what-if sandbox, ripple view

---

## 6. Tech stack (fixed; do not swap for exotic alternatives)

| Layer | Choice |
|---|---|
| Backend | Python 3.11 or 3.12, FastAPI, Uvicorn, Pydantic v2 |
| Optimisation | Google OR-Tools (CP-SAT) |
| Predictive | scikit-learn (+ numpy, pandas, joblib) |
| Storage | seed JSON in `data/`, in-memory `WorldState` for the live picture, **PostgreSQL** for plan history, events and KPI logs. Use `psycopg` (v3) with plain SQL and a `backend/db/schema.sql` file. **No ORM, no SQLAlchemy, no SQLite.** Connection string from `DATABASE_URL` (works with local Postgres or a free hosted one such as Neon or Supabase). `pnpm setup` / `pnpm db:init` creates the tables from `schema.sql`. |
| Live updates | FastAPI WebSocket |
| LLM | **Groq** (free tier) via the `groq` Python SDK, behind a thin `llm` interface. **Do not use the Anthropic API or any paid LLM API.** Key from `GROQ_API_KEY` and model name from `LLM_MODEL` env var (do not hardcode either; the user adds the key). Use JSON-mode / structured output for condition parsing, low temperature, and handle rate limits with a short retry. Offline rule-based fallback is mandatory. |
| Frontend | **Next.js (App Router) + React + TypeScript**, Tailwind CSS, lucide-react icons, Zustand for state, Recharts only for small KPI charts. The dashboard is client-side (`"use client"` components) and talks to the FastAPI backend over REST + WebSocket (backend `localhost:8000`, frontend `localhost:3000`; enable CORS). Next.js is the frontend only: do NOT put business logic in Next API routes. Backend URL comes from `NEXT_PUBLIC_API_URL`. **The Gantt is custom-built** (CSS grid / absolutely positioned divs), no heavy Gantt library. |
| Tooling | **pnpm** (not npm/yarn), **tsx** for any TS scripts (not ts-node), pytest, ruff, `concurrently` for `pnpm dev` |

---

## 7. Repo structure

```
Aeolus-SIH-Project/
  CLAUDE.md
  README.md
  package.json            # root scripts (pnpm dev, dev:api, dev:web, db:init, test, seed, smoke, setup)
  .env.example            # DATABASE_URL, GROQ_API_KEY, LLM_MODEL, NEXT_PUBLIC_API_URL (no real secrets)
  .gitignore
  data/                   # seeded synthetic JSON (generator script + output)
  docs/                   # DEMO.md, architecture image (user adds it), screenshots
  scripts/                # setup.mjs, run-api.mjs (pick .venv/Scripts vs .venv/bin), smoke.py
  backend/
    requirements.txt
    app/ ...              # modules from the map in section 3
    tests/
  frontend/
    src/ ...
```

---

## 8. Frontend / UX (this decides how it feels to SIH judges)

Multi-page planner app (Next.js App Router), desktop-first. It must look good at 1366x768 and 1920x1080 with no horizontal scroll. Each page has one purpose. The UI is uncluttered and uses plain English.

**Theme (light only).** White surfaces with blue for everything else: primary `#2563EB`, tints `#EFF6FF` / `#DBEAFE`, deep navy `#0B1F44` for headings and text, soft grey-blue borders. Green, amber and red are only for status (pass / warning / fail), and used sparingly. Gantt priority colours run from P1 darkest blue to P4 lightest, always with the P1-P4 text label as well. Cards are rounded with soft shadows and generous spacing. One font: Inter, bundled locally through `next/font/local` so the app works offline. Text is large and readable, and every control has a visible keyboard focus state. Animations are motion only (never start at opacity 0) and respect reduced motion. Theme tokens live in `frontend/src/app/globals.css`.

**Shell (root layout, `components/shell/`).** A fixed left sidebar with icons and plain labels, with a "1" badge on Review when a plan is waiting, and Reset scenario at the bottom. A slim top bar shows the scenario clock (pause/resume), the connection indicator, the plan status chip and a small "Synthetic data" badge. The root layout also owns the WebSocket connection, health polling, toasts, a global "working on it" screen with elapsed time, the bar-detail drawer and the end-of-plan dialog. State (plan, events, KPIs, feed, chat) lives in the Zustand store, so navigating never loses anything.

**Page pattern.** Each page has a title, a one-line description, at most one primary button, and a dismissible "What to do here" box (2 to 3 lines, remembered in localStorage). Each page ends with a "Next: ..." button that moves the user forward. Empty states say what to do next, and loading uses skeletons. Technical terms (CP-SAT, lambda, cache, fingerprint) stay out of main copy and only appear inside collapsible "Show details" sections or tooltips.

**Pages**

| Route | Purpose |
|---|---|
| `/` Home | Welcome and what Aeolus does; a 5-step Getting started checklist that ticks itself off (generate, review, approve, try an event, check results); one "Next step" card that always points to the right action; 4 headline KPI cards; recent activity |
| `/data` Data and live feed | Tabs for Aircraft, Crews, Weapons and Missions as tables; the live feed on the side; a synthetic-data note |
| `/plan` Mission plan | Generate plan; the custom Gantt (rows = aircraft by base, airspace lane, hatched outages, weather overlays, dashed ghosts for changed slots, Proposed/Live toggle); clicking a bar opens a side drawer with crew, weapons, plan strength (Strong / Moderate / Weak) and the change reason; mission table with reasons for unassigned missions |
| `/events` Events | Four large cards (Aircraft down, New priority mission, Weather closure, New threat zone) opening modal forms; prepared answers (contingency cache) with one-click Run; maintenance report; event history; a result banner such as "Replanned in 1.8 s, 3 of 40 changed" with Review changes |
| `/assistant` Assistant | Chat that turns plain English into conditions, shown as editable and removable chips with Confirm / Cancel; 3 example prompts |
| `/review` Review and approve | Summary of what triggered the plan; old vs new side by side with a plain reason per change (or a comparison with the simple method for the first plan); missions without aircraft; the rule-by-rule checklist; big Approve / Reject buttons with confirm dialogs and an optional reject note |
| `/results` Results | All 8 KPIs as cards with a one-line explanation and tooltip; simple method vs Aeolus; replan time chart (prepared vs fresh); saved snapshots; "End plan and save results" |
| `/guide` How to use | The full flow with a button per step, plus the 5-minute demo script |

**Feedback.** Changed bars pulse for a few seconds. Toasts cover success and errors. An unreachable API shows a banner with Retry. Every UI number comes from the backend; the frontend only renames KPIs into plain English (`frontend/src/lib/kpi.ts`).

---

## 9. KPIs (all shown live; targets are OUR suggestions, label them as such, not official requirements)

| # | KPI | Measure | Suggested target |
|---|---|---|---|
| 1 | Reduction in planning time | Solver time vs greedy baseline AND vs a stated manual baseline (config value, default 180 min, labelled "assumed") | seconds vs hours |
| 2 | Replan time | Event to approval-ready plan, split cache hit vs miss | < 10 s miss, < 2 s hit |
| 3 | Priority mission coverage | % of P1/P2 missions assigned | 100% P1 when feasible |
| 4 | Hard-constraint violations | Count from the validator | 0 |
| 5 | Resource utilisation | % of serviceable aircraft and crews tasked | above the greedy baseline |
| 6 | Plan stability | % of assignments changed per event | < 15% |
| 7 | Cache hit rate | % of injected events served from cache | 60%+ for the modelled events |
| 8 | Explanation coverage | % of changes shown with a reason | 100% |

"End plan" stores a KPI snapshot in PostgreSQL and shows a summary.

---

## 10. Quality bar (what SIH judges test, so build for it)

- **It must really work live, end to end:** generate plan, inject event, replan, diff, approve, publish. Smooth, with no dead buttons and no console errors.
- **Reliable demo:** deterministic seed, solver time limit with best-found result, graceful fallback if the LLM or network is down, one-command start.
- **Clear before/after story:** greedy baseline vs Aeolus, with measured numbers shown in the UI and the README.
- **Honest and explainable:** synthetic data stated, assumptions listed, every change has a reason, human stays in control.
- **Credible engineering:** modular code, typed models, validator separate from solver, tests that pass, a clean README.
- **Polish:** consistent design, loading/empty/error states, nothing half-built visible in the UI.

**Tests (pytest):** each validator rule has a violating-case test; solver feasibility/infeasibility; stability penalty reduces changes; cache hit/miss/invalidation; the API happy path; the offline chat parser.

**`scripts/smoke.py`:** headless run of the demo scenario through the API. It asserts 0 violations and prints the KPI table (this feeds the README results table).

**README:** problem, solution, architecture (Mermaid diagram of the section 3 flow, plus `docs/architecture.png` if the user has added it), Windows setup and run steps, demo steps, measured KPI results, synthetic-data note and assumptions, tech stack, future scope.

**`docs/DEMO.md`:** a 4 to 5 minute demo script: (1) show data and live feed, (2) generate initial plan and show greedy vs Aeolus, (3) inject "aircraft down" (cache hit) and show the diff, (4) type "Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00" in chat (cache miss) and show the reasons, (5) reject once to show the loop, then approve, (6) end plan and show the KPI summary.

---

## 11. Build order and git workflow

Repo already exists with remote `origin` = `git@github.com:Eduman1551/Aeolus-SIH-Project.git`, branch `main`.

**Commit and push after every finished module, not at the end.** Run that module's tests, make sure the app/build isn't broken, then:
`git add -A && git commit -m "..." && git push origin main`

Suggested milestones (one or more commits each; split further only if there are genuinely separate changes):
1. Scaffold: folders, `.gitignore`, `.env.example`, root `package.json`, setup/run scripts, this CLAUDE.md
2. Data models + synthetic dataset generator
3. Fusion layer + `WorldState` + live-feed simulator
4. Independent validator + its tests
5. CP-SAT solver (constraints, objective) + greedy baseline + tests
6. Stability term + warm start + replan
7. Plan lifecycle/orchestrator + PostgreSQL schema + API + WebSocket
8. Events: types, classifier, application to state
9. KPI computation and logging
10. Fragility score + contingency cache
11. Predictive model (lite) wired into the solver
12. LLM layer + offline parser + explanations
13. Frontend: app shell, theme, KPI strip
14. Frontend: Gantt + mission table
15. Frontend: event panel + live feed + chat
16. Frontend: plan diff + approve/reject + validation tab
17. Polish pass, smoke script, README, DEMO.md, measured KPI table

**Commit message rules (they must read like a real student developer wrote them):**
- Short plain subject, about 60 chars or fewer, imperative, specific to what actually changed. Lowercase is fine.
- No emoji. No `feat:` / `chore:` / `refactor(scope):` prefix on every commit. No marketing words (robust, seamless, comprehensive, leverage, enhance, streamline).
- Optional body of 1 to 3 plain lines, only when the *why* isn't obvious. No bullet-list essays.
- Good: `add synthetic fleet and crew generator` · `solver: stop crews exceeding duty hours` · `fix gantt bars overlapping when two missions share a slot` · `wire approve and reject buttons to plan api`
- Bad: `feat: implement comprehensive constraint validation framework`
- Commits must match real changes. Never make empty or filler commits. A real bug found while testing is its own small `fix ...` commit.

**Git safety:** never force-push or rewrite history. If a push fails (auth or network), keep committing locally, tell the user, and continue. Never commit `.env`, API keys, `.venv`, `node_modules`, `__pycache__`, `.next`, or build output. Commit `.env.example` instead.

---

## 12. Working style

- Make a short plan and a todo list, then **build through all milestones without waiting for approval between modules.** Stop only if truly blocked.
- Verify as you go: run tests, run the app, and actually look at the UI (screenshots via Playwright if available) before calling a UI module done.
- Edit existing files with targeted changes. Don't regenerate whole files for small fixes.
- Skip minor nitpicks. Flag only significant issues or trade-offs.
- Keep status updates short. At the end report: what works, what is simplified, how to run it, known limitations.
- **If time gets tight, cut in this order:** predictive model, then contingency cache, then fragility score, then LLM wording of explanations (keep the deterministic reasons). **Never cut:** solver, validator, the event-to-replan loop, the dashboard with diff + Approve/Reject.
