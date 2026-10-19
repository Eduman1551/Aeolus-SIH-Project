"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Card entrance: a short staggered rise. Transform only, so nothing is ever hidden. */
export function Rise({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

const NUM = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s;

/** Counts a displayed number up from its previous value (or 0 on first show). Keeps any prefix/suffix. */
export function CountUp({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const m = text.match(NUM);
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const commas = !!m && m[2].includes(",");
  const prev = useRef<number>(0);
  const [shown, setShown] = useState<number>(reduce || Number.isNaN(target) ? target : 0);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    if (reduce) {
      setShown(target);
      prev.current = target;
      return;
    }
    const ctl = animate(prev.current, target, { duration: 0.9, ease: "easeOut", onUpdate: setShown });
    prev.current = target;
    return () => ctl.stop();
  }, [target, reduce]);

  if (!m || Number.isNaN(target)) return <>{text}</>;
  const body = commas ? Math.round(shown).toLocaleString("en-US") : shown.toFixed(decimals);
  return (
    <>
      {m[1]}
      {body}
      {m[3]}
    </>
  );
}

// higher is better for these KPIs; the rest are better when lower
const HIGHER_BETTER = new Set(["priority_coverage", "utilisation", "stability", "cache_hit_rate", "explanation_coverage"]);

/** "better" / "worse" for ~1.2 s after a KPI value changes (e.g. after a replan). */
export function useChangeFlash(id: string, value: number | null): "better" | "worse" | null {
  const prev = useRef<number | null>(value);
  const [flash, setFlash] = useState<"better" | "worse" | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null || value === null || before === value) return;
    const up = value > before;
    setFlash(up === HIGHER_BETTER.has(id) ? "better" : "worse");
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [id, value]);
  return flash;
}
