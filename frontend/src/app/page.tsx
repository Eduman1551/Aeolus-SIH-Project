"use client";

import { ArrowRight, CheckCircle2, Circle, Layers, Play, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import KpiCard from "@/components/KpiCard";
import { Button, ButtonLink, Card, NextStep, PageHeader, Skeleton, TipBox } from "@/components/ui";
import { cx } from "@/lib/format";
import { HOME_KPIS } from "@/lib/kpi";
import { useStore } from "@/lib/store";

const WHAT = [
  { icon: Layers, title: "One live picture", text: "Aircraft, crews, weapons, weather, airspace and threats in one place, updating live." },
  { icon: Sparkles, title: "Best plan in seconds", text: "Assigns aircraft, crews and weapons to missions, most important missions first." },
  { icon: Zap, title: "Fast, calm replanning", text: "When something changes, it replans quickly and changes as little as possible." },
  { icon: ShieldCheck, title: "You stay in control", text: "Every change has a reason, every plan is checked, and nothing goes live until you approve." },
];

function useNextStep() {
  const plan = useStore((s) => s.plan);
  const progress = useStore((s) => s.progress);
  if (!plan || plan.status === "no_plan") return { title: "Generate your first plan", text: "Aeolus will assign aircraft, crews and weapons to the 15 missions in today's tasking.", href: "/plan", cta: "Go to Mission plan", action: "generate" as const };
  if (plan.proposal)
    return {
      title: plan.active ? "Review the proposed changes" : "Review and approve the plan",
      text: plan.active ? "Something changed. Aeolus has a new plan ready. Check the reasons, then approve or reject it." : "Check the plan and its rule checks, then approve it to make it live.",
      href: "/review",
      cta: "Open Review and approve",
    };
  if (plan.status === "ended") return { title: "Start a new scenario", text: "The plan has ended and the results are saved. Reset to run the scenario again.", href: "/results", cta: "See the results" };
  if (!plan.events.length) return { title: "Try an event", text: "See how Aeolus replans when an aircraft breaks down or the weather closes a base.", href: "/events", cta: "Go to Events" };
  if (!progress.visitedResults) return { title: "Check the results", text: "See how fast and how well Aeolus planned, compared with a simple method.", href: "/results", cta: "Go to Results" };
  return { title: "Ask the assistant", text: "Type a change in plain English, for example a base closure or a new mission.", href: "/assistant", cta: "Open Assistant" };
}

export default function HomePage() {
  const plan = useStore((s) => s.plan);
  const progress = useStore((s) => s.progress);
  const busy = useStore((s) => s.busy);
  const generate = useStore((s) => s.generate);
  const router = useRouter();
  const next = useNextStep();

  const steps = [
    { label: "Generate a plan", done: !!plan && plan.status !== "no_plan", href: "/plan" },
    { label: "Review it", done: progress.reviewed || !!plan?.active, href: "/review" },
    { label: "Approve it", done: !!plan?.active, href: "/review" },
    { label: "Try an event", done: (plan?.events.length ?? 0) > 0, href: "/events" },
    { label: "Check the results", done: progress.visitedResults || plan?.status === "ended", href: "/results" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const activity = [
    ...(plan?.events ?? []).map((e) => ({ key: `e${e.id}`, at: e.at ?? "", text: e.description, sub: `Event at ${e.clock} · ${e.cache_hit ? "answered from a prepared plan" : "solved fresh"}` })),
    ...(plan?.history ?? []).map((h, i) => ({
      key: `h${h.id}${i}`,
      at: h.at,
      text: h.status === "active" ? `Plan ${h.id} approved` : h.status === "rejected" ? `Plan ${h.id} rejected` : `Plan ${h.id} ${h.status}`,
      sub: h.label ?? "",
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader title="Welcome to Aeolus" description="A planning assistant for air operations. It suggests the plan, you decide." />
      <TipBox
        id="home"
        lines={["Follow the Getting started checklist, it ticks itself off as you go.", "The big card on the right always shows the best next step."]}
      />

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6">
        <Card title="Getting started" action={<span className="num text-[13.5px] text-dim">{doneCount} of 5 done</span>}>
          <div className="px-6 pb-5 pt-3">
            <div className="h-2 overflow-hidden rounded-full bg-primary-50">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(doneCount / 5) * 100}%` }} />
            </div>
            <ol className="mt-4 space-y-1">
              {steps.map((s, i) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-panel-2">
                    {s.done ? <CheckCircle2 size={22} className="text-teal" /> : <Circle size={22} className="text-line-2" />}
                    <span className={cx("text-[15px]", s.done ? "text-dim line-through decoration-line-2" : "text-text")}>
                      {i + 1}. {s.label}
                    </span>
                    <ArrowRight size={15} className="ml-auto text-dim" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Card>

        <section className="flex flex-col justify-between rounded-2xl bg-primary p-7 text-white shadow-[var(--shadow-card)]">
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-primary-100">Next step</div>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight">{next.title}</h2>
            <p className="mt-2 text-[15.5px] leading-7 text-primary-100">{next.text}</p>
          </div>
          <div className="mt-6">
            {next.action === "generate" ? (
              <Button
                size="lg"
                className="!border-white !bg-white !text-primary-dark hover:!bg-primary-50"
                icon={<Play size={17} />}
                disabled={!!busy || !plan}
                onClick={async () => {
                  await generate();
                  router.push("/review");
                }}
              >
                Generate plan
              </Button>
            ) : (
              <ButtonLink href={next.href} size="lg" className="!border-white !bg-white !text-primary-dark hover:!bg-primary-50" icon={<ArrowRight size={17} />}>
                {next.cta}
              </ButtonLink>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {plan ? HOME_KPIS.map((id) => plan.kpis.find((k) => k.id === id)).filter(Boolean).map((k) => <KpiCard key={k!.id} k={k!} />) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[136px]" />)}
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6">
        <Card title="Recent activity" action={<Link href="/events" className="text-[13.5px] font-medium text-primary hover:underline">All events</Link>}>
          <div className="px-6 pb-5 pt-2">
            {activity.length === 0 ? (
              <p className="py-6 text-[14.5px] text-muted">Nothing yet. Generate a plan to get started.</p>
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.key} className="py-3">
                    <div className="text-[14.5px] text-text">{a.text}</div>
                    <div className="mt-0.5 truncate text-[13px] text-dim">{a.sub}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card title="What Aeolus does">
          <ul className="space-y-4 px-6 pb-6 pt-4">
            {WHAT.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <Icon size={19} />
                </span>
                <div>
                  <div className="text-[15px] font-semibold">{title}</div>
                  <div className="text-[14px] leading-6 text-muted">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <NextStep href={next.href} label={next.title} hint="The checklist above ticks itself off as you work through the steps." />
    </div>
  );
}
