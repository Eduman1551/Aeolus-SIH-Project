"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle animated wind streamlines (light blue on white) for the Home hero only.
 * Never interactive, low contrast, and drawn once without motion when the user prefers reduced motion.
 */
export default function WindFlow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    };
    resize();

    // smooth flow field drifting east with gentle meanders
    const field = (x: number, y: number, t: number) => {
      const a = Math.sin(y * 0.012 + t * 0.0004) * 0.5 + Math.cos(x * 0.006 - t * 0.0003) * 0.35;
      return { vx: 1.1 + Math.cos(a) * 0.4, vy: Math.sin(a) * 0.55 };
    };
    const N = 90;
    const pts = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, age: Math.random() * 200 }));

    const step = (t: number) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(96,165,250,0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of pts) {
        const { vx, vy } = field(p.x, p.y, t);
        ctx.moveTo(p.x, p.y);
        p.x += vx;
        p.y += vy;
        p.age += 1;
        ctx.lineTo(p.x, p.y);
        if (p.x > w + 5 || p.y < -5 || p.y > h + 5 || p.age > 260) {
          p.x = -5 + Math.random() * w * 0.2;
          p.y = Math.random() * h;
          p.age = 0;
        }
      }
      ctx.stroke();
    };

    if (reduce) {
      for (let i = 0; i < 160; i++) step(i * 16);
      return;
    }
    let raf = 0;
    const loop = (t: number) => {
      if (!document.hidden) step(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
