"use client";

import { ArrowRight, CheckCircle2, CircleSlash, ClipboardCheck, Clock3, Plus, Repeat2, UserRound, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import ValidationChecklist from "@/components/ValidationChecklist";
import { Button, ButtonLink, Card, Details, Empty, Field, Modal, NextStep, PageHeader, PriorityTag, Pill, TipBox, inputCls } from "@/components/ui";
import { CHANGE_LABEL, cx, hhmm, PATH_LABEL, secs } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Change, Plan, Proposal, SortieView, World } from "@/lib/types";

const KIND_ICON: Record<Change["kind"], React.ReactNode> = {
  aircraft_swap: <Repeat2 size={15} />,
  crew_swap: <UserRound size={15} />,
  retimed: <Clock3 size={15} />,
  removed: <CircleSlash size={15} />,
  added: <Plus size={15} />,
};

function Slot({ v, empty }: { v: SortieView | null; empty: string }) {
  if (!v) return <div className="text-[14.5px] text-dim">{empty}</div>;
  return (
    <div className="num text-[14.5px] text-text">
      <span className="font-semibold">{v.aircraft_id}</span> with crew {v.crew_id}
      <div className="text-[13px] text-muted">
        {hhmm(v.takeoff)} to {hhmm(v.landing)}
      </div>
    </div>
  );
}

function ChangeRow({ c }: { c: Change }) {
  const removed = c.kind === "removed";
  return (
    <li className="border-b border-line px-6 py-4 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PriorityTag p={c.priority} compact />
            <span className="num font-semibold">{c.mission_id}</span>
            <span className={cx("flex items-center gap-1 text-[13px] font-medium", removed ? "text-coral" : "text-primary-dark")}>
              {KIND_ICON[c.kind]} {CHANGE_LABEL[c.kind]}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13.5px] text-dim">{c.mission_name}</div>
        </div>
        <Slot v={c.old} empty="Not assigned before" />
        <div className={cx("rounded-lg", c.new ? "" : "")}>
          <Slot v={c.new} empty="Dropped from the plan" />
        </div>
      </div>
      <p className="mt-2.5 rounded-xl bg-panel-2 px-4 py-2.5 text-[14px] leading-6 text-muted">
        <span className="font-semibold text-text">Why: </span>
        {c.reason}
      </p>
    </li>
  );
}

function covered(plan: Plan | null, world: World, prios: number[]) {
  const ms = world.missions.filter((m) => m.status === "open" && prios.includes(m.priority));
  const got = new Set(plan?.sorties.map((s) => s.mission_id));
  return `${ms.filter((m) => got.has(m.id)).length} of ${ms.length}`;
}

function CompareWithSimple({ prop }: { prop: Proposal }) {
  const world = useStore((s) => s.world);
  const baseline = useStore((s) => s.plan?.baseline ?? null);
  if (!world || !baseline) return null;
  const open = world.missions.filter((m) => m.status === "open").length;
  const rows: [string, string, string][] = [
    ["Missions covered", `${new Set(prop.plan.sorties.map((s) => s.mission_id)).size} of ${open}`, `${new Set(baseline.sorties.map((s) => s.mission_id)).size} of ${open}`],
    ["Critical (P1) missions", covered(prop.plan, world, [1]), covered(baseline, world, [1])],
    ["High priority (P2) missions", covered(prop.plan, world, [2]), covered(baseline, world, [2])],
    ["Flights planned", String(prop.plan.sorties.length), String(baseline.sorties.length)],
    ["Time to plan", secs(prop.plan.solve_ms), secs(baseline.solve_ms)],
  ];
  return (
    <Card title="Compared with a simple method">
      <div className="px-6 pb-5 pt-3">
        <p className="text-[14px] text-muted">
          The simple method takes missions in priority order and grabs the first free aircraft and crew, like a quick manual plan.
        </p>
        <table className="mt-3 w-full text-[14.5px]">
          <thead>
            <tr className="text-left text-[13px] text-dim">
              <th className="py-2 font-semibold" />
              <th className="py-2 font-semibold text-primary-dark">Aeolus</th>
              <th className="py-2 font-semibold">Simple method</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, a, b]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-2.5 text-muted">{k}</td>
                <td className="num py-2.5 font-semibold text-text">{a}</td>
                <td className="num py-2.5 text-muted">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProposalReview({ prop }: { prop: Proposal }) {
  const busy = useStore((s) => s.busy);
  const approve = useStore((s) => s.approve);
  const reject = useStore((s) => s.reject);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const initial = prop.trigger.kind === "initial";
  const st = prop.stability;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start gap-6 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">Waiting for your decision</Pill>
              {prop.publishable ? (
                <Pill tone="ok">
                  <CheckCircle2 size={13} /> All rules pass
                </Pill>
              ) : (
                <Pill tone="bad">
                  <XCircle size={13} /> Breaks {prop.validation.violations.length} rule{prop.validation.violations.length === 1 ? "" : "s"}
                </Pill>
              )}
            </div>
            <h2 className="mt-3 text-[20px] font-semibold leading-snug">{initial ? "First plan for today" : "New plan after these changes"}</h2>
            {!initial && (
              <ul className="mt-2 space-y-1">
                {prop.trigger.label
                  .split(/ \+ |; /)
                  .filter(Boolean)
                  .map((t) => (
                    <li key={t} className="flex gap-2 text-[14.5px] text-text">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {t.replace(" (reported unserviceable)", "")}
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-2 max-w-[820px] text-[15px] leading-7 text-muted">{prop.summary_llm ?? prop.summary}</p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
            {(initial
              ? [
                  ["Flights", String(prop.plan.sorties.length)],
                  ["Not assigned", String(prop.plan.unassigned.length)],
                  ["Time taken", secs(prop.timing.total_ms)],
                ]
              : [
                  ["Changed", `${st.changed} of ${st.total}`],
                  ["Added", String(st.added)],
                  ["Time taken", secs(prop.timing.total_ms)],
                ]
            ).map(([k, v]) => (
              <div key={k} className="min-w-[104px] rounded-xl bg-primary-50 px-3 py-3">
                <div className="num text-[20px] font-semibold text-navy">{v}</div>
                <div className="text-[12.5px] text-muted">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 pb-5">
          <Details>
            <div className="space-y-1">
              <div>
                Proposed plan <span className="num">{prop.id}</span>
                {prop.previous_id ? ` compared with live plan ${prop.previous_id}` : prop.trigger.compared_with ? ` compared with rejected plan ${prop.trigger.compared_with}` : ""}.
              </div>
              <div>
                How it was made: {PATH_LABEL[prop.timing.path] ?? prop.timing.path} (solver status {prop.timing.solver_status}, solve {secs(prop.timing.solve_ms)}, total{" "}
                {secs(prop.timing.total_ms)}).
              </div>
              {!initial && <div>Stability: {st.stability_pct}% of existing flights unchanged.</div>}
              {prop.summary_llm && <div>Facts the wording was based on: {prop.summary}</div>}
            </div>
          </Details>
        </div>
      </Card>

      {initial ? (
        <CompareWithSimple prop={prop} />
      ) : (
        <Card>
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="text-[16px] font-semibold">What changes ({prop.changes.length})</h2>
            <span className="text-[13px] text-dim">Every change comes with a reason</span>
          </div>
          {prop.changes.length === 0 ? (
            <p className="px-6 py-6 text-[14.5px] text-muted">No flight had to change.</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 border-y border-line bg-panel-2 px-6 py-2.5 text-[13px] font-semibold text-dim">
                <span>Mission</span>
                <span>Current plan</span>
                <span className="text-primary-dark">Proposed plan</span>
              </div>
              <ul>
                {prop.changes.map((c) => (
                  <ChangeRow key={c.id} c={c} />
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {prop.plan.unassigned.length > 0 && (
        <Card title={`Missions without aircraft (${prop.plan.unassigned.length})`}>
          <ul className="px-6 pb-5 pt-2">
            {prop.plan.unassigned.map((u) => (
              <li key={u.mission_id} className="border-b border-line py-2.5 text-[14px] leading-6 text-muted last:border-b-0">
                <span className="num mr-2 font-semibold text-text">{u.mission_id}</span>
                {u.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="px-6 py-5">
        <ValidationChecklist rep={prop.validation} />
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center gap-4 rounded-2xl border border-line bg-white px-6 py-4 shadow-[var(--shadow-pop)]">
        <div className="flex-1 text-[14.5px] text-muted">
          {prop.publishable ? "Approve to make this the live plan, or reject to ask Aeolus for another option." : "This plan breaks a rule, so it cannot be approved. Reject it to get another option."}
        </div>
        <Button variant="danger" size="lg" icon={<XCircle size={18} />} onClick={() => setDialog("reject")} disabled={!!busy}>
          Reject
        </Button>
        <Button variant="primary" size="lg" icon={<CheckCircle2 size={18} />} onClick={() => setDialog("approve")} disabled={!prop.publishable || !!busy}>
          Approve plan
        </Button>
      </div>

      <Modal open={dialog === "approve"} onClose={() => setDialog(null)} title="Approve this plan?" width={480}>
        <p className="text-[14.5px] leading-6 text-muted">
          It becomes the live plan. {initial ? `${prop.plan.sorties.length} flights` : `${st.changed} changed and ${st.added} added flights`} will be briefed to crews. Aeolus will
          then prepare answers for the likeliest problems.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle2 size={16} />}
            onClick={async () => {
              setDialog(null);
              await approve();
            }}
          >
            Approve plan
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "reject"} onClose={() => setDialog(null)} title="Reject this plan?" width={520}>
        <Field label="Note (optional)" hint="A note like 'keep SK-205 on the ground' becomes a new condition. Without one, Aeolus finds the next best option.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cx(inputCls, "!h-auto py-2.5")} placeholder="Why are you rejecting it?" autoFocus />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              setDialog(null);
              await reject(note);
              setNote("");
            }}
          >
            Reject and find another option
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default function ReviewPage() {
  const plan = useStore((s) => s.plan);
  const markProgress = useStore((s) => s.markProgress);
  const prop = plan?.proposal ?? null;

  useEffect(() => {
    if (prop) markProgress("reviewed");
  }, [prop, markProgress]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 pb-4">
      <PageHeader title="Review and approve" description="See what changed and why, check the rules, then decide." />
      <TipBox id="review" lines={["Read the reason next to each change and check that every rule passes.", "Approve to make the plan live, or reject with a note to get another option."]} />

      {prop ? (
        <ProposalReview prop={prop} />
      ) : (
        <>
          <Card>
            {plan?.active ? (
              <Empty icon={<CheckCircle2 size={22} />} title="Nothing to review. The live plan is up to date.">
                When something changes, try an event or describe it to the assistant. The new plan will wait here for you.
                <div className="mt-4 flex justify-center gap-2">
                  <ButtonLink href="/events" variant="primary" icon={<ArrowRight size={16} />}>
                    Try an event
                  </ButtonLink>
                </div>
              </Empty>
            ) : (
              <Empty icon={<ClipboardCheck size={22} />} title="No plan to review yet.">
                Generate a plan first. It will appear here for you to check and approve.
                <div className="mt-4 flex justify-center">
                  <ButtonLink href="/plan" variant="primary" icon={<ArrowRight size={16} />}>
                    Go to Mission plan
                  </ButtonLink>
                </div>
              </Empty>
            )}
          </Card>
          {plan?.active_validation && (
            <Card className="px-6 py-5">
              <ValidationChecklist rep={plan.active_validation} />
            </Card>
          )}
        </>
      )}

      <NextStep
        href={prop ? "/plan" : plan?.active ? "/events" : "/plan"}
        label={prop ? "See it on the timeline" : plan?.active ? "Try an event" : "Generate a plan"}
        hint={prop ? "The Mission plan page shows the proposed plan with changed flights highlighted." : undefined}
      />
    </div>
  );
}
