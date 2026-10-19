// `pnpm dev:clean`: stop leftover Aeolus dev servers (Next.js / uvicorn) on the web and API ports.
// Only looks at WEB_PORT (default 3000) and API_PORT (default 8000). Anything that is not an
// Aeolus node/python process is left alone and reported.
import { spawnSync } from "node:child_process";
import { API_PORT, WEB_PORT, isBusy, isOurDevServer, isWin, killCommand, owners } from "./ports.mjs";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// look up both ports first: stopping one server can make its partner exit on its own
const found = [WEB_PORT, API_PORT].map((port) => ({ port, who: owners(port) }));

let stopped = 0;
let skipped = 0;
for (const { port, who } of found) {
  if (!who.length) {
    console.log(`Port ${port}: free`);
    continue;
  }
  for (const o of who) {
    if (!isOurDevServer(o)) {
      console.log(`Port ${port}: ${o.name} (PID ${o.pid}) is not an Aeolus dev server, left running. Stop it yourself if you are sure: ${killCommand(o.pid)}`);
      skipped++;
      continue;
    }
    if (!alive(o.pid)) {
      console.log(`Port ${port}: ${o.name} (PID ${o.pid}) already exited`);
      stopped++;
      continue;
    }
    const r = isWin ? spawnSync("taskkill", ["/PID", String(o.pid), "/T", "/F"], { encoding: "utf8" }) : spawnSync("kill", [String(o.pid)]);
    if (r.status === 0 || !alive(o.pid)) {
      console.log(`Port ${port}: stopped ${o.name} (PID ${o.pid})`);
      stopped++;
    } else {
      console.log(`Port ${port}: could not stop PID ${o.pid}: ${(r.stderr || "").trim()}`);
    }
  }
}

await new Promise((r) => setTimeout(r, 800));
const still = [];
for (const port of [WEB_PORT, API_PORT]) if (await isBusy(port)) still.push(port);
console.log(`\n${stopped} stopped, ${skipped} left alone.${still.length ? ` Still busy: ${still.join(", ")}.` : " Ports are free, run pnpm dev."}`);
process.exit(still.length ? 1 : 0);
