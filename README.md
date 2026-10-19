# Aeolus (Keeper of Wind)

Decision support for planning and re-tasking air operations. SIH 2026, problem statement **PS26249**.

Aircraft, crew, weapons, airspace, weather and threat information sits in separate systems, so building and changing an air tasking plan is slow and scarce aircraft are not used well. Aeolus brings that information into one live picture, suggests the best plan in seconds, and replans quickly when something changes. A human approves every plan.

> **Synthetic data.** All aircraft, crews, bases, places and numbers are fictional.

## What it does

- **One live picture:** merges fleet, crew, weapons, airspace, weather, threats and missions, with a simulated live feed.
- **Best plan in seconds:** an optimiser assigns aircraft, crews and weapons to missions, most important first, within every hard rule.
- **Fast replanning:** after an event (aircraft down, weather closure, new mission, new threat) it replans while changing as little as possible, often from answers it prepared in advance.
- **Every change explained and checked:** each change comes with a plain reason, and an independent checker tests every plan against 18 rules before it can be approved.
- **Ops room view:** a fictional theatre map with moving aircraft, live charts, a commander summary, and a guided "Run exercise" demo.

## Tech stack

| Part | Built with |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), WebSocket |
| Planning | Google OR-Tools (CP-SAT), scikit-learn |
| Storage | PostgreSQL |
| Language model | Groq (optional, offline fallback built in) |

## Quick start

Needs Python 3.11 to 3.13, Node.js 20+ and pnpm. Copy `.env.example` to `.env` and set `DATABASE_URL`, `GROQ_API_KEY`, `LLM_MODEL` and `NEXT_PUBLIC_API_URL` (the Groq key is optional).

```bash
pnpm setup
```
```bash
pnpm dev
```

Open http://localhost:3000 (the API runs on port 8000). If `pnpm dev` says a port is busy, run `pnpm dev:clean` and start again.

## Demo

Click **Run exercise** on the Home page for a guided run, or follow the 5-minute script in [docs/DEMO.md](docs/DEMO.md).

Screenshots: to be added in `docs/`.

More detail (architecture, how each part works, measured results, assumptions, future scope): [docs/DETAILS.md](docs/DETAILS.md).

## Team

Squad 106
