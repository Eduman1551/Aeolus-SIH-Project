// Run a Python command with the project venv, on Windows or Unix.
// Usage: node scripts/run-py.mjs <python args...>
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function venvPython() {
  const win = path.join(root, ".venv", "Scripts", "python.exe");
  const nix = path.join(root, ".venv", "bin", "python");
  if (existsSync(win)) return win;
  if (existsSync(nix)) return nix;
  console.error("No .venv found. Run `pnpm setup` first.");
  process.exit(1);
}

export function runPython(args, opts = {}) {
  const env = { ...process.env, PYTHONPATH: path.join(root, "backend"), PYTHONUTF8: "1" };
  const child = spawn(venvPython(), args, { cwd: root, stdio: "inherit", env, ...opts });
  child.on("exit", (code) => process.exit(code ?? 1));
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPython(process.argv.slice(2));
}
