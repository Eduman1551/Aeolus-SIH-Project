"use client";

import { motion } from "motion/react";

// Page transition: a short slide only. No opacity, so content is never hidden if animation is paused.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
