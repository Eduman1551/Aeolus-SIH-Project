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
const isProdBuild = process.env.NODE_ENV === "production";

// Backend URL: env var first (Vercel), then the repo-root .env (local), then localhost for local dev only.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || fromRoot.NEXT_PUBLIC_API_URL || (isProdBuild ? "" : "http://localhost:8000");
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || fromRoot.NEXT_PUBLIC_WS_URL || "";
if (isProdBuild && !apiUrl) {
  console.warn("[aeolus] NEXT_PUBLIC_API_URL is not set. The deployed dashboard will not find the backend.");
}

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  // a second dev server (e.g. a preview next to your own pnpm dev) needs its own build folder
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_WS_URL: wsUrl,
  },
};

export default config;
