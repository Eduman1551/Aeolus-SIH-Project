// `pnpm dev`: check that the web and API ports are free, then start both servers together.
// Ports: WEB_PORT (default 3000) and API_PORT (default 8000).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { API_PORT, WEB_PORT, isBusy, isOurDevServer, killCommand, owners, root } from "./ports.mjs";

function rootEnv(key) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return undefined;
  const m = readFileSync(file, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`, "m"));
  return m ? m[1].replace(/^["']|["']$/g, "") : undefined;
}

const busy = [];
for (const [label, port] of [["web dashboard", WEB_PORT], ["API", API_PORT]]) {
  if (await isBusy(port)) busy.push({ label, port, who: owners(port) });
}

if (busy.length) {
  console.error("\nCannot start: a port Aeolus needs is already in use.\n");
  for (const b of busy) {
    console.error(`  Port ${b.port} (${b.label}) is held by:`);
    if (!b.who.length) console.error("    an unknown process (could not look it up)");
    for (const o of b.who) {
      console.error(`    ${o.name} (PID ${o.pid})${isOurDevServer(o) ? "  <- leftover Aeolus dev server" : ""}`);
      if (o.cmd) console.error(`      ${o.cmd.length > 150 ? `${o.cmd.slice(0, 147)}...` : o.cmd}`);
    }
  }
  const ours = busy.flatMap((b) => b.who).filter(isOurDevServer);
  const other = busy.flatMap((b) => b.who).filter((o) => !isOurDevServer(o));
  console.error("\nTo free the ports:");
  if (ours.length) console.error("  pnpm dev:clean            (stops leftover Aeolus dev servers on these ports only)");
  for (const o of other) console.error(`  ${killCommand(o.pid)}   (not an Aeolus process; check before stopping it)`);
  if (!ours.length && !other.length) console.error("  close the program using the port, then run pnpm dev again");
  console.error(`\nOr run on other ports, for example:  WEB_PORT=3001 API_PORT=8001 pnpm dev  (PowerShell: $env:WEB_PORT=3001; $env:API_PORT=8001; pnpm dev)\n`);
  process.exit(1);
}

// keep the dashboard pointed at the API port actually in use
let apiUrl = process.env.NEXT_PUBLIC_API_URL || rootEnv("NEXT_PUBLIC_API_URL") || `http://localhost:${API_PORT}`;
const urlPort = Number(new URL(apiUrl).port || (apiUrl.startsWith("https") ? 443 : 80));
if (urlPort !== API_PORT) {
  console.warn(`NEXT_PUBLIC_API_URL points at port ${urlPort} but the API will run on ${API_PORT}; using http://localhost:${API_PORT}`);
  apiUrl = `http://localhost:${API_PORT}`;
}

const env = { ...process.env, WEB_PORT: String(WEB_PORT), API_PORT: String(API_PORT), PORT: String(WEB_PORT), NEXT_PUBLIC_API_URL: apiUrl };
console.log(`Starting Aeolus: API on :${API_PORT}, dashboard on http://localhost:${WEB_PORT}`);

const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "concurrently.cmd" : "concurrently");
const cmd = `"${bin}" -k -n api,web -c cyan,yellow "pnpm dev:api" "pnpm dev:web"`;
const child = spawn(cmd, { cwd: root, stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
