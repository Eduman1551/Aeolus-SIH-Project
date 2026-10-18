"use client";

import { ArrowUp, Bot, Check, MessageSquareText, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Pill } from "./ui";

const EXAMPLES = [
  "Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00",
  "SK-205 has 6 faults",
  "threat level 3 in Z5",
  "cancel M14",
];

const TYPE_LABEL: Record<string, string> = {
  weather_closure: "Weather closure",
  zone_restriction: "Airspace restriction",
  new_mission: "New mission",
  aircraft_down: "Aircraft down",
  crew_unavailable: "Crew unavailable",
  threat_zone: "Threat",
  risk_update: "Maintenance data",
  cancel_mission: "Cancel mission",
  set_priority: "Priority change",
};

export default function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.busy);
  const health = useStore((s) => s.health);
  const send = useStore((s) => s.chatSend);
  const confirm = useStore((s) => s.chatConfirm);
  const cancel = useStore((s) => s.chatCancel);
  const setTab = useStore((s) => s.setTab);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    send(t);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11.5px] text-muted">
        <Sparkles size={13} className={health?.llm.configured ? "text-amber" : "text-dim"} />
        {health?.llm.configured ? (
          <span>
            Text is turned into conditions by <span className="mono text-text">{health.llm.model}</span>, with the offline parser as fallback.
          </span>
        ) : (
          <span>Offline rule-based parser (no LLM key). Works without network.</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {chat.length === 0 && (
          <div className="flex flex-col items-center px-3 pt-6 text-center">
            <MessageSquareText size={24} className="text-dim" />
            <div className="mt-2 text-[14px] font-medium">Tell Aeolus what changed</div>
            <p className="mt-1 text-[12px] leading-5 text-muted">
              Type conditions in plain English. You will see exactly how they were understood before anything is replanned. The solver makes the plan; the language model only reads your text.
            </p>
            <div className="mt-4 flex w-full flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => setText(e)}
                  className="rounded-md border border-line bg-panel-2/60 px-2.5 py-1.5 text-left text-[12px] text-muted hover:border-line-2 hover:text-text"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {chat.map((m) => {
            if (m.role === "planner") {
              return (
                <div key={m.id} className="fade-in ml-8 self-end rounded-lg rounded-br-sm border border-amber/30 bg-amber-dim/25 px-3 py-2 text-[13px] leading-5">
                  {m.text}
                </div>
              );
            }
            if (m.role === "system") {
              return (
                <div key={m.id} className={cx("fade-in mr-8 flex gap-2 text-[12.5px] leading-5", m.tone === "error" ? "text-coral" : "text-muted")}>
                  <Bot size={15} className="mt-0.5 shrink-0" />
                  <span>{m.text}</span>
                </div>
              );
            }
            if (m.role === "preview") {
              return (
                <div key={m.id} className="fade-in mr-4 rounded-lg border border-line-2 bg-panel-2 p-3">
                  <div className="flex items-center gap-2">
                    <Bot size={15} className="text-muted" />
                    <span className="text-[12.5px]">
                      I understood {m.conditions.length} condition{m.conditions.length === 1 ? "" : "s"}:
                    </span>
                    <Pill className="ml-auto text-[10.5px]">{m.parser}</Pill>
                  </div>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {m.conditions.map((c, i) => (
                      <li key={i} className="flex gap-2 rounded-md border border-line bg-bg/60 px-2 py-1.5">
                        <span className="mono text-[11px] text-dim">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="label text-[10.5px] text-amber">{TYPE_LABEL[c.type] ?? c.type}</div>
                          <div className="text-[12.5px] text-text">{c.description}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {m.problems.length > 0 && (
                    <div className="mt-2 text-[11.5px] text-coral">Skipped: {m.problems.join("; ")}</div>
                  )}
                  {m.state === "pending" ? (
                    <div className="mt-2.5 flex gap-2">
                      <Button variant="primary" size="sm" icon={<Check size={13} />} onClick={() => confirm(m.id)} disabled={!!busy}>
                        Apply and replan
                      </Button>
                      <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => cancel(m.id)} disabled={!!busy}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className={cx("mt-2 text-[11.5px]", m.state === "applied" ? "text-teal" : "text-dim")}>
                      {m.state === "applied" ? "Applied" : "Cancelled, nothing changed"}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={m.id} className="fade-in mr-4 rounded-lg border border-teal/30 bg-teal-dim/15 p-3">
                <div className="flex items-center gap-2 text-[12.5px] text-teal">
                  <Check size={14} /> {m.text}
                </div>
                <div className="mono mt-1 text-[11px] text-muted">{m.badge}</div>
                <p className="mt-1.5 text-[12.5px] leading-5 text-text">{m.summary}</p>
                <Button size="sm" className="mt-2" onClick={() => setTab("changes")}>
                  Review {m.planId}
                </Button>
              </div>
            );
          })}
        </div>
        <div ref={end} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-md border border-line-2 bg-bg p-1.5 focus-within:border-amber">
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
            placeholder="e.g. Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00"
            className="min-h-[38px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] leading-5 text-text outline-none placeholder:text-dim focus-visible:outline-none"
            aria-label="Planner conditions"
          />
          <Button variant="primary" size="sm" onClick={submit} disabled={!text.trim() || !!busy} aria-label="Send" className="h-8 w-8 !px-0">
            <ArrowUp size={15} />
          </Button>
        </div>
        <div className="mt-1 text-[10.5px] text-dim">Enter to send · Shift+Enter for a new line</div>
      </div>
    </div>
  );
}
