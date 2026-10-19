"use client";

import { ArrowRight, Clapperboard, Clock } from "lucide-react";
import { startExercise } from "@/components/ExerciseRunner";
import { Button, ButtonLink, Card, Details, NextStep, PageHeader, TipBox } from "@/components/ui";

const STEPS = [
  { title: "Look at the data", text: "See the aircraft, crews, weapons and missions, and watch live updates arrive.", href: "/data", cta: "Open Data" },
  { title: "Generate a plan", text: "Aeolus assigns aircraft, crews and weapons to every mission it can, most important first.", href: "/plan", cta: "Open Mission plan" },
  { title: "Review and approve it", text: "Check the comparison with a simple method and the rule checks, then approve.", href: "/review", cta: "Open Review" },
  { title: "Try an event", text: "Break an aircraft, close a base or add a mission. Aeolus replans in seconds.", href: "/events", cta: "Open Events" },
  { title: "Describe a change in words", text: "Type a change in plain English, check how it was understood, then confirm.", href: "/assistant", cta: "Open Assistant" },
  { title: "Review the changes", text: "Every change shows old and new side by side with a reason. Approve, or reject with a note.", href: "/review", cta: "Open Review" },
  { title: "Check the results", text: "See the eight measures, the comparison and the replan times. End the plan to save them.", href: "/results", cta: "Open Results" },
];

const DEMO = [
  {
    min: "0:40",
    title: "Show the live picture",
    say: "Planners pull aircraft, crews, weapons, weather and threats from separate systems. Aeolus puts them in one live picture. All of it is synthetic.",
    do: "Open Data and live feed. Point at the predicted readiness of each aircraft and the live feed on the right.",
    href: "/data",
  },
  {
    min: "0:50",
    title: "Generate the first plan",
    say: "A simple method covers 12 of 15 missions. Aeolus covers 14, including every critical one, in a fraction of a second.",
    do: "On Mission plan, click Generate plan. On Review, show the comparison and the rule checks, then Approve.",
    href: "/plan",
  },
  {
    min: "0:45",
    title: "An aircraft goes down",
    say: "Aeolus had already prepared an answer for this, so the new plan is ready almost instantly, and it is still checked.",
    do: "On Events, open Aircraft down and keep the aircraft marked 'answer prepared'. Click Review changes and read one reason.",
    href: "/events",
  },
  {
    min: "1:00",
    title: "A bigger change in plain English",
    say: "The assistant only reads my words. I check what it understood before anything is replanned.",
    do: "On Assistant, click the example 'Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00', send it, then Confirm.",
    href: "/assistant",
  },
  {
    min: "0:35",
    title: "Reject once, then approve",
    say: "My note becomes a new condition, and Aeolus finds another option. Nothing goes live without me.",
    do: "On Review, click Reject, type 'keep SK-201 on the ground', confirm. Then approve the new option.",
    href: "/review",
  },
  {
    min: "0:30",
    title: "Show the results",
    say: "Every number here came from this session. The targets are our own suggestions.",
    do: "On Results, walk through the cards and the chart, then End plan and save results.",
    href: "/results",
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader title="How to use Aeolus" description="The full flow, step by step, plus a five-minute demo script." />
      <TipBox id="guide" lines={["Follow the steps in order the first time.", "Each step has a button that takes you to the right page."]} />

      <Card title="The flow">
        <ol className="px-6 pb-6 pt-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-5 border-b border-line py-4 last:border-b-0">
              <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[16px] font-semibold text-primary-dark">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold">{s.title}</div>
                <div className="text-[14.5px] leading-6 text-muted">{s.text}</div>
              </div>
              <ButtonLink href={s.href} variant="outline" size="sm" icon={<ArrowRight size={15} />}>
                {s.cta}
              </ButtonLink>
            </li>
          ))}
        </ol>
      </Card>

      <Card
        title="Five-minute demo script"
        action={
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[13.5px] text-dim">
              <Clock size={15} /> about 4 to 5 minutes
            </span>
            <Button variant="primary" size="sm" icon={<Clapperboard size={15} />} onClick={startExercise}>
              Run exercise
            </Button>
          </span>
        }
      >
        <div className="px-6 pb-6 pt-3">
          <p className="text-[14.5px] text-muted">Before you start, click Reset scenario in the sidebar so the day starts at 06:00 with no plan.</p>
          <ol className="mt-4 space-y-4">
            {DEMO.map((d, i) => (
              <li key={d.title} className="rounded-2xl border border-line p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="num rounded-lg bg-primary px-2.5 py-1 text-[13px] font-semibold text-white">{i + 1}</span>
                  <span className="text-[16px] font-semibold">{d.title}</span>
                  <span className="num text-[13px] text-dim">{d.min}</span>
                  <ButtonLink href={d.href} variant="ghost" size="sm" className="ml-auto" icon={<ArrowRight size={15} />}>
                    Go there
                  </ButtonLink>
                </div>
                <p className="mt-3 text-[14.5px] leading-6 text-text">
                  <span className="font-semibold">Do: </span>
                  {d.do}
                </p>
                <p className="mt-1.5 rounded-xl bg-primary-50 px-4 py-2.5 text-[14.5px] italic leading-6 text-primary-dark">&ldquo;{d.say}&rdquo;</p>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <Details summary="Show technical details">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>The planner is a constraint solver (Google OR-Tools CP-SAT). It respects aircraft readiness, range, turnaround, crew qualifications and duty hours, weapon stock, weather limits, airspace and threats.</li>
                <li>When replanning it starts from the live plan and adds a penalty for every changed flight (the stability weight, lambda), so plans change as little as possible.</li>
                <li>A separate validator re-checks every plan from the raw data with 18 rules. A plan that breaks any rule cannot be approved.</li>
                <li>After each approval the likeliest disruptions are pre-solved (the contingency cache). A cache hit needs the same event and an unchanged picture.</li>
                <li>Plan strength (Strong / Moderate / Weak) counts spare aircraft and crews that could take over a flight.</li>
                <li>Readiness percentages come from a small logistic-regression model trained on synthetic maintenance data.</li>
                <li>The language model (or the offline rule-based reader) only turns text into conditions and rewords summaries. It never makes or approves a plan.</li>
              </ul>
            </Details>
          </div>
        </div>
      </Card>

      <NextStep href="/" label="Back to Home" hint="Home always shows the best next step." />
    </div>
  );
}
