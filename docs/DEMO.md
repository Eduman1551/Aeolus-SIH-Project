# Aeolus demo script (4 to 5 minutes)

**Before you start**

- `pnpm dev` is running, and <http://localhost:3000> is open full screen (1366x768 or larger).
- The top bar shows **Live**, **DB** and **LLM** (or "Offline parser", which is fine).
- If you have rehearsed already, press **Reset** in the top bar so the scenario starts at 06:00 with no plan.
- Optional: pause the scenario clock (button next to the time) while you talk. It only runs once a plan is published.

---

## 1. The fused picture and the live feed (40 s)

> "Planners today pull aircraft, crews, weapons, airspace, weather, threats and tasking from separate systems. Aeolus fuses all of it into one live picture. Everything you see is synthetic, as the badge says."

- Point at the Gantt rows: 20 aircraft grouped by base. Each shows its **predicted serviceability %** from the maintenance model. AR-103 is 29%, and SK-202 is hatched because it is down all day.
- Point at the hatching, the **Airspace** lane (Z4 restricted 09:00-11:00) and the faint stripes where base weather is below a type's minimums (Base 2 fog in the evening).
- Open **Events** and scroll to **Live feed and events**. Messages stream in from the fleet, met office, crew roster, logistics and intel systems. The base header rows show the latest weather observation.

## 2. Generate the initial plan, Aeolus vs greedy (50 s)

- Click **Generate plan**. The result badge shows something like `Planned in 0.13 s · 23 sorties · 0 violations`.
- The **Changes** tab opens with the comparison table:

  > "Same data. A greedy planner, like a quick manual allocation, covers 12 of 15 missions and drops a P2 strike. CP-SAT covers 14 of 15, all P1 and P2, in about a tenth of a second. A manual plan is assumed to take three hours."

- Hover a bar to show crew, weapons, window and the fragility note. Point out the **L/M/H** fragility badges.
- Open **Validation**: 18 rules, all pass. "This checker is separate code. It re-reads the raw data and never trusts the solver."
- Back on **Changes**, click **Approve and publish**. The plan is now **Active**, the clock starts, and contingencies get prepared in the background.

## 3. Aircraft down, served from the cache (45 s)

- Open **Events**. **Prepared contingencies** shows `ready · built in ~0.5 s`. These are the likeliest disruptions, already solved.
- Click **Inject** on the first "... down until end of day" row.
- The badge reads `Served in 0.01 s · cache hit · 2 of 23 changed`.

  > "Aeolus had already solved this one. It still re-validated the plan against the live picture before showing it."

- The **Changes** tab shows each change with a reason, for example "AR-107 can no longer fly it: AR-107 unavailable ... Replacement: AR-102 (Arcus, B1, 73% serviceability)". On the Gantt, the old position is a dashed ghost and the new bar pulses.
- Click **Approve and publish**.

## 4. Chat: base closure plus a new P1 strike, a cache miss (60 s)

- Open **Chat** and type (or click the example): `Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00`, then press Enter.
- Aeolus shows how it understood the text: two conditions, plus which parser read it.

  > "The language model only turns text into structured conditions. You confirm them. It never makes or edits the plan."

- Click **Apply and replan**. The badge shows something like `Replanned in 0.1 s · cache miss · 11 of 21 changed · 4 added`.
- On **Changes**, read two reasons aloud:
  - the new P1 strike gets Skarns from Base 1, because Base 2 is closed at take-off time
  - a P2 mission is dropped, because every take-off or landing slot at Base 2 is closed and Base 1 is out of range
- Point at the red shaded closure band over the Base 2 rows.

## 5. Reject once, then approve (35 s)

- Click **Reject**, type a note such as `keep SK-201 on the ground`, and click **Reject and re-solve**.

  > "My note became a new condition: SK-201 down. The solver went back and found the best plan without it. A note with no condition gives the next best alternative instead."

- The new proposal shows the extra condition in its trigger line. Click **Approve and publish**.

## 6. End the plan and log the KPIs (30 s)

- Click **End plan** in the top bar. The KPI summary appears and is saved to PostgreSQL (`kpi_snapshots`).
- Walk the 8 tiles: planning time vs manual, replan time for hits and misses, P1/P2 coverage, 0 violations, resource use vs greedy, stability per event, cache hit rate, explanation coverage 100%.

  > "Every number came from this run. The targets are our own suggestions. The human approved every plan that went live."

---

**If something goes wrong**

- *"Cannot reach the Aeolus API"*: start the backend with `pnpm dev:api` and press Retry.
- *LLM not available*: chat falls back to the offline parser automatically. The demo sentence works either way.
- *Clock ran past a window while you talked*: press **Reset** and start again. Each step takes seconds.
