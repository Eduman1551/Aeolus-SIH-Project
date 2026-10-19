# Aeolus demo script (4 to 5 minutes)

The same script is in the app under **How to use** (`/guide`), with a "Go there" button for each step.

**Hands-free option:** click **Run exercise** on Home. It resets the scenario and plays the story on the clock (first plan, aircraft down from the cache, weather closure, a new P1 mission typed in chat, replan, approve), pausing at each step with a caption made from the measured results. Press **Next** to move on. Use the steps below if you prefer to drive it yourself.

**Before you start**

- `pnpm dev` is running, and <http://localhost:3000> is open full screen (1366x768 or larger).
- The top bar shows **Connected**.
- If you have rehearsed already, click **Reset scenario** at the bottom of the sidebar. The day goes back to 06:00 with no plan, and the Home checklist clears.
- The scenario clock only runs once a plan is approved. You can pause it from the top bar while you talk.

---

## 1. The live picture (40 s), Ops map and Data

> "Planners pull aircraft, crews, weapons, weather and threats from separate systems. Aeolus puts them in one live picture. Everything here is synthetic."

- Open **Ops map**: the fictional theatre with bases, targets, threat rings, weather and restricted airspace. After step 2, press play (60x) and aircraft such as ARROW-01 fly their routes; click one for its fault-risk gauge and flights.
- Open **Data and live feed**. Point at the ops charts, then the Aircraft tab: each aircraft has a predicted "ready to fly" percentage (AR-103 is low, SK-202 is down).
- Point at the **Live feed** on the right as messages arrive from the fleet system, weather office, crew roster and intelligence.

## 2. First plan, Aeolus vs a simple method (50 s), Mission plan and Review

- Open **Mission plan** and click **Generate plan**. The banner reads something like "Planned in 0.13 s, 23 flights, 0 rule problems".
- Click a bar to open the detail drawer: crew, weapons and **plan strength** (Strong / Moderate / Weak).
- Click **Review changes**. Show **Compared with a simple method**:

  > "The simple method covers 12 of 15 missions and misses a high-priority strike. Aeolus covers 14, including every P1 and P2, in about a tenth of a second. A manual plan is assumed to take three hours."

- Scroll to **Rule checks**: all 18 pass. "A separate checker re-reads the raw data. It never trusts the planner."
- Click **Approve plan**, then confirm.

## 3. Aircraft down, answered instantly (45 s), Events

- Open **Events**. Under **Prepared in advance**, Aeolus has already solved the likeliest problems.
- Click the **Aircraft down** card. Keep the aircraft marked "answer prepared" and click **Apply and replan**.
- The banner reads "Served in 0.01 s, 2 of 23 changed". Click **Review changes** and read one reason aloud, for example "AR-107 can no longer fly it ... Replacement: AR-102".
- Approve.

## 4. A bigger change in plain English (60 s), Assistant

- Open **Assistant** and click the example **"Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00"**, then send it.
- Aeolus shows two condition chips. Click the pencil on one to show it can be edited.

  > "The assistant only reads my words. I check what it understood before anything is replanned. The planner makes the plan."

- Click **Confirm and replan**. The result reads "Replanned in 0.1 s, 11 of 21 changed, 4 added". Click **Review changes**.
- Point at the side-by-side rows: the new P1 strike flies from Base 1, and two P2 missions at Base 2 are dropped because the base is closed for every possible slot.

## 5. Reject once, then approve (35 s), Review

- Click **Reject**, type `keep SK-201 on the ground`, and click **Reject and find another option**.

  > "My note became a new condition, and Aeolus found another option. Nothing goes live without me."

- Approve the new option.

## 6. Results (30 s), Results

- Open **Results**. Walk through the 8 cards (hover the (i) for what each measures), the **Simple method vs Aeolus** table and the **Replan time per event** chart (prepared answers vs solved fresh).
- Click **End plan and save results**, then confirm. The summary is saved to PostgreSQL.

  > "Every number came from this session. The targets are our own suggestions. A human approved every plan that went live."

---

**If something goes wrong**

- *"Cannot reach the Aeolus server" banner*: start the backend with `pnpm dev:api` and press Retry.
- *Language model not available*: the assistant falls back to the offline reader automatically. The demo sentence works either way.
- *The clock ran past a window while you talked*: click **Reset scenario** and start again. Each step takes seconds.
