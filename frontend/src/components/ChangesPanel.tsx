"use client";

import { ArrowRight, CheckCircle2, CircleSlash, Clock3, GitCompareArrows, Play, Plus, Repeat2, Sparkles, UserRound, XCircle, Zap } from "lucide-react";
import { useState } from "react";
import { CHANGE_LABEL, cx, hhmm, PATH_LABEL, secs } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Change, Plan, Proposal, World } from "@/lib/types";
import { Button, Empty, Pill, PriorityTag, SectionLabel } from "./ui";

const KIND_ICON: Record<Change["kind"], React.ReactNode> = {
  aircraft_swap: <Repeat2 size={13} />,
  crew_swap: <UserRound size={13} />,
  retimed: <Clock3 size={13} />,
  removed: <CircleSlash size={13} />,
  added: <Plus size={13} />,
};
const KIND_TONE: Record<Change["kind"], string> = {
  aircraft_swap: "text-amber",
  crew_swap: "text-amber",
  retimed: "text-p3",
  removed: "text-coral",
  added: "text-teal",
};

function ChangeCard({ c }: { c: Change }) {
  return (
    <li className="rounded-md border border-line bg-panel-2/60 p-2.5">
      <div className="flex items-center gap-2">
        <span className={cx("flex items-center gap-1 text-[11px] font-medium", KIND_TONE[c.kind])}>
          {KIND_ICON[c.kind]}
          {CHANGE_LABEL[c.kind]}
        </span>
        <PriorityTag p={c.priority} compact />
        <span className="mono text-[12px] font-medium">{c.mission_id}</span>
        <span className="truncate text-[11.5px] text-dim">{c.mission_name}</span>
      </div>
      <div className="mono mt-1.5 flex items-center gap-1.5 text-[11.5px]">
        <span className={cx(c.old ? "text-muted" : "text-dim")}>
          {c.old ? `${c.old.aircraft_id} ${c.old.crew_id} ${hhmm(c.old.takeoff)}` : "unassigned"}
        </span>
        <ArrowRight size={12} className="shrink-0 text-dim" />
        <span className={cx(c.new ? "text-text" : "text-coral")}>{c.new ? `${c.new.aircraft_id} ${c.new.crew_id} ${hhmm(c.new.takeoff)}` : "dropped"}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-[18px] text-text/90">
        <span className="label mr-1 text-[10.5px] text-dim">Reason</span>
        {c.reason}
      </p>
    </li>
  );
}

function covered(plan: Plan | null, world: World, prios: number[]) {
  const ms = world.missions.filter((m) => m.status === "open" && prios.includes(m.priority));
  const got = new Set(plan?.sorties.map((s) => s.mission_id));
  return `${ms.filter((m) => got.has(m.id)).length}/${ms.length}`;
}

function BaselineCompare({ prop }: { prop: Proposal }) {
  const world = useStore((s) => s.world);
  const baseline = useStore((s) => s.plan?.baseline ?? null);
  const hist = useStore((s) => s.plan?.kpi_history);
  if (!world || !baseline) return null;
  const a = prop.plan;
  const rows: [string, string, string][] = [
    ["Missions covered", `${new Set(a.sorties.map((s) => s.mission_id)).size}/${world.missions.filter((m) => m.status === "open").length}`, `${new Set(baseline.sorties.map((s) => s.mission_id)).size}/${world.missions.filter((m) => m.status === "open").length}`],
    ["P1 covered", covered(a, world, [1]), covered(baseline, world, [1])],
    ["P2 covered", covered(a, world, [2]), covered(baseline, world, [2])],
    ["Sorties", String(a.sorties.length), String(baseline.sorties.length)],
    ["Violations", String(prop.validation.violations.length), "0"],
    ["Planning time", secs(a.solve_ms), secs(baseline.solve_ms)],
  ];
  return (
    <div className="mt-3">
      <SectionLabel>Aeolus vs greedy baseline (same data, measured)</SectionLabel>
      <table className="mt-1.5 w-full text-[12px]">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-1 font-normal" />
            <th className="py-1 font-medium text-amber">Aeolus CP-SAT</th>
            <th className="py-1 font-normal">Greedy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v, b]) => (
            <tr key={k} className="border-t border-line/60">
              <td className="py-1 text-muted">{k}</td>
              <td className="mono py-1 text-text">{v}</td>
              <td className="mono py-1 text-muted">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] leading-4 text-dim">
        Greedy takes missions in priority order and grabs the first free aircraft and crew. A manual plan is assumed to take {hist?.manual_baseline_min ?? 180} min.
      </p>
      {baseline.unassigned.length > 0 && (
        <p className="mt-1 text-[11px] leading-4 text-dim">
          Greedy leaves {baseline.unassigned.map((u) => u.mission_id).join(", ")} unassigned.
        </p>
      )}
    </div>
  );
}

function ProposalView({ prop }: { prop: Proposal }) {
  const busy = useStore((s) => s.busy);
  const approve = useStore((s) => s.approve);
  const reject = useStore((s) => s.reject);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [showFacts, setShowFacts] = useState(false);
  const initial = prop.trigger.kind === "initial";
  const st = prop.stability;
  const hit = prop.timing.path === "cache hit";

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="warn">Pending approval</Pill>
          {prop.publishable ? (
            <Pill tone="ok">
              <CheckCircle2 size={11} /> 0 violations
            </Pill>
          ) : (
            <Pill tone="bad">
              <XCircle size={11} /> {prop.validation.violations.length} violations, cannot publish
            </Pill>
          )}
          <Pill tone={hit ? "ok" : "neutral"}>
            {hit && <Zap size={11} />}
            {PATH_LABEL[prop.timing.path] ?? prop.timing.path} · {secs(prop.timing.total_ms)}
          </Pill>
        </div>
        <div className="mono mt-2 text-[11.5px] text-muted">
          {prop.id}
          {prop.previous_id ? ` vs active ${prop.previous_id}` : prop.trigger.compared_with ? ` vs rejected ${prop.trigger.compared_with}` : ""}
        </div>
        <div className="mt-1 text-[12.5px] leading-5 text-text">
          <span className="label mr-1 text-[10.5px] text-dim">Trigger</span>
          {prop.trigger.label}
        </div>

        {!initial && (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
            {[
              ["Changed", `${st.changed} of ${st.total}`],
              ["Added", String(st.added)],
              ["Stable", `${st.stability_pct}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-bg/60 py-1.5">
                <div className="num text-[15px] font-semibold">{v}</div>
                <div className="label text-[10px] text-dim">{k}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-md border border-line bg-bg/50 p-2.5">
          {prop.summary_llm && !showFacts ? (
            <>
              <div className="flex items-center gap-1.5 text-[10.5px] text-amber">
                <Sparkles size={11} /> Worded by the LLM from the facts only
              </div>
              <p className="mt-1 text-[12.5px] leading-5">{prop.summary_llm}</p>
            </>
          ) : (
            <p className="text-[12.5px] leading-5">{prop.summary}</p>
          )}
          {prop.summary_llm && (
            <button className="mt-1 text-[11px] text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => setShowFacts((v) => !v)}>
              {showFacts ? "Show LLM wording" : "Show deterministic facts"}
            </button>
          )}
        </div>

        {initial ? (
          <BaselineCompare prop={prop} />
        ) : (
          <div className="mt-3">
            <SectionLabel right={<span className="text-[11px] text-dim">every change has a reason</span>}>Changes ({prop.changes.length})</SectionLabel>
            {prop.changes.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-dim">No assignment had to change.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {prop.changes.map((c) => (
                  <ChangeCard key={c.id} c={c} />
                ))}
              </ul>
            )}
          </div>
        )}

        {prop.plan.unassigned.length > 0 && (
          <div className="mt-3">
            <SectionLabel>Unassigned ({prop.plan.unassigned.length})</SectionLabel>
            <ul className="mt-1.5 flex flex-col gap-1">
              {prop.plan.unassigned.map((u) => (
                <li key={u.mission_id} className="text-[12px] leading-[18px] text-muted">
                  <span className="mono mr-1.5 text-text">{u.mission_id}</span>
                  {u.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-panel px-3 py-2.5">
        {rejecting ? (
          <div className="fade-in">
            <label className="text-[11.5px] text-muted" htmlFor="reject-note">
              Why reject? A note like &quot;keep SK-205 on the ground&quot; becomes a new condition. Otherwise Aeolus returns the next best alternative.
            </label>
            <textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              autoFocus
              className="mt-1.5 w-full resize-none rounded-md border border-line-2 bg-bg px-2 py-1.5 text-[12.5px] text-text placeholder:text-dim focus:border-amber"
              placeholder="e.g. don't use AR-104"
            />
            <div className="mt-1.5 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={busy?.label.startsWith("Re-solving")}
                disabled={!!busy}
                onClick={async () => {
                  await reject(note);
                  setRejecting(false);
                  setNote("");
                }}
              >
                Reject and re-solve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              className="flex-1"
              icon={<CheckCircle2 size={15} />}
              onClick={approve}
              disabled={!prop.publishable || !!busy}
              loading={busy?.label.startsWith("Publishing")}
              title={prop.publishable ? "Publish as the active plan" : "Plans with violations cannot be published"}
            >
              Approve and publish
            </Button>
            <Button variant="danger" icon={<XCircle size={15} />} onClick={() => setRejecting(true)} disabled={!!busy}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChangesPanel() {
  const plan = useStore((s) => s.plan);
  const busy = useStore((s) => s.busy);
  const generate = useStore((s) => s.generate);
  if (!plan) return null;
  if (plan.proposal) return <ProposalView prop={plan.proposal} />;
  if (!plan.active) {
    return (
      <Empty icon={<GitCompareArrows size={24} />} title="No plan to review">
        Generate the initial plan. You will see it here with a comparison against the greedy baseline before you approve it.
        <div className="mt-3">
          <Button variant="primary" icon={<Play size={14} />} onClick={generate} disabled={!!busy}>
            Generate initial plan
          </Button>
        </div>
      </Empty>
    );
  }
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <Pill tone={plan.status === "ended" ? "info" : "ok"}>{plan.status === "ended" ? "Ended" : "Active"}</Pill>
        <span className="mono text-[12px] text-muted">{plan.active.id}</span>
      </div>
      <Empty icon={<CheckCircle2 size={24} />} title="Nothing waiting for approval">
        Inject an event or type a condition in Chat. Aeolus replans and shows old vs new here with a reason for every change.
      </Empty>
      <SectionLabel>Decision history</SectionLabel>
      <ul className="mt-1.5 flex flex-col gap-1">
        {plan.history
          .slice()
          .reverse()
          .slice(0, 10)
          .map((h, i) => (
            <li key={`${h.id}${i}`} className="flex gap-2 text-[11.5px]">
              <span className="mono text-text">{h.id}</span>
              <span className={cx(h.status === "active" ? "text-teal" : h.status === "rejected" ? "text-coral" : "text-dim")}>{h.status}</span>
              <span className="truncate text-dim">{h.label}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
