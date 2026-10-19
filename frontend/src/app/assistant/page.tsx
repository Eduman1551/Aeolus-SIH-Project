"use client";

import { ArrowRight, ArrowUp, Bot, Check, MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ConditionChip from "@/components/ConditionChip";
import { Button, ButtonLink, Card, Details, NextStep, PageHeader, TipBox } from "@/components/ui";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";

const EXAMPLES = ["Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00", "SK-205 has 6 faults", "Threat level 3 in Z5"];

export default function AssistantPage() {
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.busy);
  const health = useStore((s) => s.health);
  const plan = useStore((s) => s.plan);
  const send = useStore((s) => s.chatSend);
  const confirm = useStore((s) => s.chatConfirm);
  const cancel = useStore((s) => s.chatCancel);
  const edit = useStore((s) => s.chatEditCondition);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat]);

  const submit = (t = text) => {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    send(v);
  };

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <PageHeader title="Assistant" description="Describe a change in plain English. Aeolus turns it into conditions you can check." />
      <TipBox
        id="assistant"
        lines={["Type what changed, or click an example.", "Check the conditions Aeolus understood, edit them if needed, then press Confirm."]}
      />

      <Card className="flex flex-col overflow-hidden">
        <div className="max-h-[calc(100vh-430px)] min-h-[360px] flex-1 overflow-y-auto px-6 py-6">
          {chat.length === 0 && (
            <div className="flex flex-col items-center pt-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary">
                <MessageSquareText size={22} />
              </span>
              <div className="mt-3 text-[17px] font-semibold">What changed?</div>
              <p className="mt-1 max-w-[520px] text-[14.5px] leading-6 text-muted">
                You will always see how your message was understood before anything is replanned. Aeolus builds the plan; the assistant only reads your words.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {chat.map((m) => {
              if (m.role === "planner")
                return (
                  <div key={m.id} className="fade-in ml-16 self-end rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] leading-6 text-white">
                    {m.text}
                  </div>
                );
              if (m.role === "system")
                return (
                  <div key={m.id} className={cx("fade-in mr-16 flex gap-2.5 text-[14.5px] leading-6", m.tone === "error" ? "text-coral" : "text-muted")}>
                    <Bot size={18} className="mt-1 shrink-0 text-primary" />
                    <span>{m.text}</span>
                  </div>
                );
              if (m.role === "preview")
                return (
                  <div key={m.id} className="fade-in mr-10 rounded-2xl border border-line bg-panel-2 p-4">
                    <div className="flex items-center gap-2 text-[14.5px]">
                      <Bot size={18} className="text-primary" />
                      {m.state === "pending" ? (
                        <span>
                          I understood {m.conditions.length} condition{m.conditions.length === 1 ? "" : "s"}. Edit or remove any, then confirm.
                        </span>
                      ) : (
                        <span>Conditions</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {m.conditions.map((c, i) => (
                        <ConditionChip key={`${m.id}-${i}-${c.description}`} c={c} editable={m.state === "pending"} onChange={(nc) => edit(m.id, i, nc)} />
                      ))}
                      {m.conditions.length === 0 && <p className="text-[14px] text-dim">All conditions removed.</p>}
                    </div>
                    {m.problems.length > 0 && <div className="mt-2 text-[13.5px] text-coral">Could not use: {m.problems.join("; ")}</div>}
                    {m.state === "pending" ? (
                      <div className="mt-4 flex gap-2">
                        <Button variant="primary" icon={<Check size={16} />} onClick={() => confirm(m.id)} disabled={!!busy || m.conditions.length === 0}>
                          Confirm and replan
                        </Button>
                        <Button variant="ghost" icon={<X size={16} />} onClick={() => cancel(m.id)} disabled={!!busy}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className={cx("mt-3 text-[13.5px] font-medium", m.state === "applied" ? "text-teal" : "text-dim")}>
                        {m.state === "applied" ? "Applied" : "Cancelled, nothing changed"}
                      </div>
                    )}
                    <div className="mt-3">
                      <Details summary="Show details">Read by {m.parser.startsWith("groq") ? `the language model (${m.parser.replace("groq ", "")})` : m.parser.replace("offline parser", "the offline rule-based reader")}.</Details>
                    </div>
                  </div>
                );
              return (
                <div key={m.id} className="fade-in mr-10 rounded-2xl border border-primary-100 bg-primary-50 p-4">
                  <div className="text-[16px] font-semibold text-text">{m.badge}</div>
                  <p className="mt-1.5 text-[14.5px] leading-6 text-muted">{m.summary}</p>
                  <ButtonLink href="/review" variant="primary" className="mt-3" icon={<ArrowRight size={16} />}>
                    Review changes
                  </ButtonLink>
                </div>
              );
            })}
          </div>
          <div ref={end} />
        </div>

        <div className="border-t border-line bg-white px-6 py-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => setText(e)}
                className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-[13.5px] text-primary-dark hover:border-primary hover:bg-white"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3 rounded-2xl border border-line-2 bg-white p-2 focus-within:border-primary">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="For example: Base 2 closed 14:00 to 18:00"
              className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 text-text outline-none placeholder:text-dim focus-visible:outline-none"
              aria-label="Describe what changed"
            />
            <Button variant="primary" onClick={() => submit()} disabled={!text.trim() || !!busy} aria-label="Send" className="h-11 w-11 !px-0">
              <ArrowUp size={18} />
            </Button>
          </div>
          <div className="mt-2 flex justify-between text-[12.5px] text-dim">
            <span>Enter to send, Shift+Enter for a new line</span>
            <span>{health?.llm.configured ? "Language model on, offline reader as backup" : "Offline reader (no internet needed)"}</span>
          </div>
        </div>
      </Card>

      <NextStep
        href={plan?.proposal ? "/review" : "/results"}
        label={plan?.proposal ? "Review the changes" : "See the results"}
        hint={plan?.proposal ? "Your conditions produced a new plan. Check it before it goes live." : "See how well Aeolus is doing."}
      />
    </div>
  );
}
