import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The project keeps one .env at the repo root. Pick up NEXT_PUBLIC_* values from it.
function rootPublicEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), "..", ".env");
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const fromRoot = rootPublicEnv();
const onVercel = !!process.env.VERCEL;

// Backend URL. On Vercel it stays empty: the API is served from the same domain at /api, so there
// is no URL or CORS to manage. Locally: env var, then the repo-root .env, then localhost:8000.
const apiUrl = onVercel
  ? process.env.NEXT_PUBLIC_API_URL || ""
  : process.env.NEXT_PUBLIC_API_URL || fromRoot.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  // a second dev server (e.g. a preview next to your own pnpm dev) needs its own build folder
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
};

export default config;
