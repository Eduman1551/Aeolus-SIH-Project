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

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || fromRoot.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
};

export default config;
