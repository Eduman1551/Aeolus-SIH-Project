// Port helpers shared by dev.mjs and dev-clean.mjs (Windows, macOS, Linux).
import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const isWin = process.platform === "win32";

export const WEB_PORT = Number(process.env.WEB_PORT || 3000);
export const API_PORT = Number(process.env.API_PORT || 8000);

function canConnect(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.setTimeout(400);
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("timeout", () => (s.destroy(), resolve(false)));
    s.once("error", () => resolve(false));
  });
}

function canBind(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen({ port, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/** True when something already listens on the port (IPv4 or IPv6). */
export async function isBusy(port) {
  if (await canConnect(port, "127.0.0.1")) return true;
  if (await canConnect(port, "::1")) return true;
  return !(await canBind(port));
}

/** Processes listening on a port: [{ pid, name, cmd }]. Best effort; empty if the OS tool is missing. */
export function owners(port) {
  if (isWin) {
    const ps =
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
      `Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { ` +
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=$_"; ` +
      `[pscustomobject]@{ pid = $_; name = $p.Name; cmd = $p.CommandLine } } | ConvertTo-Json -Compress`;
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
    const out = (r.stdout || "").trim();
    if (!out) return [];
    try {
      const data = JSON.parse(out);
      return (Array.isArray(data) ? data : [data]).map((d) => ({ pid: Number(d.pid), name: d.name || "?", cmd: d.cmd || "" }));
    } catch {
      return [];
    }
  }
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  const pids = [...new Set((r.stdout || "").split(/\s+/).filter(Boolean).map(Number))];
  return pids.map((pid) => {
    const ps = spawnSync("ps", ["-p", String(pid), "-o", "comm=,args="], { encoding: "utf8" });
    const line = (ps.stdout || "").trim();
    return { pid, name: line.split(/\s+/)[0] || "?", cmd: line };
  });
}

/** A leftover dev server from this project: node (Next.js) or python (uvicorn) started from this folder. */
export function isOurDevServer(o) {
  const runtime = /node|python|uvicorn/i.test(o.name);
  const cmd = isWin ? o.cmd.toLowerCase() : o.cmd;
  const here = isWin ? root.toLowerCase() : root;
  return runtime && cmd.includes(here);
}

export function killCommand(pid) {
  return isWin ? `taskkill /PID ${pid} /T /F` : `kill ${pid}`;
}
