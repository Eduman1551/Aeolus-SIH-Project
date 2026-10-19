"use client";

import { ArrowRight, Loader2, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { secs } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

type Ctx = { go: (href: string) => void };
type Step = { title: string; intro: string; run?: (ctx: Ctx) => Promise<string> };

const get = () => useStore.getState();

async function waitFor(pred: () => boolean, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function replanLine() {
  const lr = get().plan?.last_result;
  if (!lr) return "Aeolus could not produce a new plan.";
  const how = lr.path === "cache hit" ? "used the answer it had prepared" : "solved it fresh";
  return `Aeolus ${how} in ${secs(lr.total_ms)}: ${lr.changed} of ${lr.total} existing flights changed${lr.added ? `, ${lr.added} added` : ""}. ${
    lr.publishable ? "Every rule check passes and each change has a reason." : "Some rules are broken, so it cannot be approved."
  }`;
}

async function approveIfWaiting() {
  if (get().plan?.proposal?.publishable) await get().approve();
}

/** The scripted exercise. Every caption is built from the real result of the step. */
const STEPS: Step[] = [
  {
    title: "Run exercise",
    intro: "This resets the scenario and plays a full planning cycle on the clock: first plan, aircraft down, weather closure, a new P1 mission typed in chat, then approval. Press Next at each step.",
  },
  {
    title: "1. First plan",
    intro: "Resetting the scenario and asking Aeolus for the first plan...",
    run: async ({ go }) => {
      await get().reset();
      await get().generate();
      go("/review");
      const p = get().plan;
      const prop = p?.proposal;
      if (!prop) return "Aeolus could not produce a plan.";
      const open = get().world?.missions.filter((m) => m.status === "open").length ?? 0;
      const covered = new Set(prop.plan.sorties.map((s) => s.mission_id)).size;
      const simple = new Set((p?.baseline?.sorties ?? []).map((s) => s.mission_id)).size;
      return `Aeolus covered ${covered} of ${open} missions in ${secs(prop.timing.total_ms)} with ${prop.validation.violations.length} rule problems. A simple method covers ${simple}. Next approves it.`;
    },
  },
  {
    title: "2. Approve and fly",
    intro: "Approving the plan and starting the clock...",
    run: async ({ go }) => {
      await approveIfWaiting();
      await get().setSpeed(60);
      if (get().plan?.paused) await get().togglePause();
      go("/ops");
      const ready = await waitFor(() => get().plan?.cache.status === "ready");
      const n = get().plan?.cache.entries.length ?? 0;
      return `The plan is live and the clock runs at 60x, so flights take off on the map. ${ready ? `Aeolus has already prepared answers for the ${n} likeliest problems.` : "Aeolus is still preparing answers for likely problems."}`;
    },
  },
  {
    title: "3. Aircraft down",
    intro: "An aircraft reports a fault...",
    run: async ({ go }) => {
      await waitFor(() => get().plan?.cache.status === "ready", 8000);
      const entry = get().plan?.cache.entries.find((e) => e.valid && e.event.type === "aircraft_down");
      const ev = entry ? { type: "aircraft_down", params: entry.event.params } : { type: "aircraft_down", params: { aircraft_id: get().plan?.active?.sorties.at(-1)?.aircraft_id } };
      await get().injectEvent(ev, "Aircraft down");
      go("/review");
      return `${String(ev.params.aircraft_id)} is down for the rest of the day. ${replanLine()} Next approves it.`;
    },
  },
  {
    title: "4. Weather closure",
    intro: "Approving, then the weather office reports a closure...",
    run: async ({ go }) => {
      await approveIfWaiting();
      await waitFor(() => get().plan?.cache.status === "ready", 8000);
      const entry = get().plan?.cache.entries.find((e) => e.valid && e.event.type === "weather_closure");
      const params = entry ? entry.event.params : { location_id: "B2", start: "20:00", end: "23:00" };
      await get().injectEvent({ type: "weather_closure", params }, "Weather closure");
      go("/review");
      return `${String(params.location_id)} is closed by weather. ${replanLine()} Next approves it and moves to the assistant.`;
    },
  },
  {
    title: "5. New P1 mission by chat",
    intro: "Approving, then typing a new mission in plain English...",
    run: async ({ go }) => {
      await approveIfWaiting();
      go("/assistant");
      await get().chatSend("add P1 strike on Z3 at 16:00");
      const msg = [...get().chat].reverse().find((m) => m.role === "preview");
      if (!msg || msg.role !== "preview") return "The assistant could not read the message.";
      return `The assistant read it as: ${msg.conditions.map((c) => c.description).join("; ")}. It only reads words; the plan still comes from the optimiser. Next confirms it.`;
    },
  },
  {
    title: "6. Replan",
    intro: "Confirming the condition and replanning...",
    run: async ({ go }) => {
      const msg = [...get().chat].reverse().find((m) => m.role === "preview" && m.state === "pending");
      if (msg) await get().chatConfirm(msg.id);
      go("/review");
      return `${replanLine()} Next approves the final plan.`;
    },
  },
  {
    title: "7. Approve",
    intro: "Approving the final plan...",
    run: async ({ go }) => {
      await approveIfWaiting();
      go("/results");
      const k = Object.fromEntries((get().plan?.kpis ?? []).map((x) => [x.id, x.display]));
      return `Done. Plan is live. Results so far: replan ${k.replan_time}, ${k.cache_hit_rate} prepared answers used, ${k.violations} rule problems, ${k.explanation_coverage} of changes explained. Every number comes from this run.`;
    },
  },
];

export async function startExercise() {
  try {
    await api.clock({ action: "resume" });
  } catch {
    /* the step itself reports problems */
  }
  useStore.getState().setExercise(0);
}

export default function ExerciseRunner() {
  const step = useStore((s) => s.exercise);
  const setStep = useStore((s) => s.setExercise);
  const router = useRouter();
  const [caption, setCaption] = useState<string>("");
  const [working, setWorking] = useState(false);
  const ran = useRef<number | null>(null);

  useEffect(() => {
    if (step === null) {
      ran.current = null;
      return;
    }
    if (ran.current === step) return;
    ran.current = step;
    const s = STEPS[step];
    setCaption(s.intro);
    if (!s.run) return;
    setWorking(true);
    s.run({ go: (href) => router.push(href) })
      .then(setCaption)
      .catch((e) => setCaption(`This step failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setWorking(false));
  }, [step, router]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[55] flex justify-center px-4" style={{ paddingLeft: "var(--sidebar-w)" }}>
      <div className="slide-in pointer-events-auto w-full max-w-[640px] rounded-2xl border border-primary-100 bg-white p-5 shadow-[var(--shadow-pop)]" role="dialog" aria-label="Guided exercise">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wider text-primary">
          Exercise {step > 0 && <span className="num text-dim">· step {step} of {STEPS.length - 1}</span>}
        </div>
        <div className="mt-1 text-[17px] font-semibold text-text">{s.title}</div>
        <p className="mt-1.5 min-h-[48px] text-[14.5px] leading-6 text-muted" aria-live="polite">
          {working && <Loader2 size={15} className="spin mr-1.5 inline text-primary" />}
          {caption}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.slice(1).map((_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i < step ? "bg-primary" : "bg-primary-100"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" icon={<Square size={13} />} onClick={() => setStep(null)}>
              {last ? "Close" : "Stop"}
            </Button>
            {!last && (
              <Button variant="primary" size="sm" icon={<ArrowRight size={15} />} disabled={working} onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
