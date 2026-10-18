// One-time setup: Python venv + deps, synthetic data, model, database tables, frontend deps.
// Usage: pnpm setup
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function run(cmd, args, { allowFail = false, cwd = root } = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const env = { ...process.env, PYTHONPATH: path.join(root, "backend"), PYTHONUTF8: "1" };
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env, shell: isWin && !cmd.endsWith(".exe") });
  if (r.status !== 0 && !allowFail) {
    console.error(`\nStep failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}

function findPython() {
  const candidates = isWin
    ? [["py", ["-3.12"]], ["py", ["-3.11"]], ["py", ["-3.13"]], ["python", []]]
    : [["python3.12", []], ["python3.11", []], ["python3.13", []], ["python3", []]];
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
      encoding: "utf8",
      shell: isWin,
    });
    const v = (r.stdout || "").trim();
    if (r.status === 0 && ["3.11", "3.12", "3.13"].includes(v)) return { cmd, pre, v };
  }
  return null;
}

const venvPy = isWin ? path.join(root, ".venv", "Scripts", "python.exe") : path.join(root, ".venv", "bin", "python");

if (!existsSync(venvPy)) {
  const py = findPython();
  if (!py) {
    console.error("Python 3.11, 3.12 or 3.13 not found. Install it from python.org and re-run `pnpm setup`.");
    process.exit(1);
  }
  console.log(`Using Python ${py.v}`);
  run(py.cmd, [...py.pre, "-m", "venv", ".venv"]);
}

run(venvPy, ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPy, ["-m", "pip", "install", "--prefer-binary", "-r", path.join("backend", "requirements.txt")]);
run(venvPy, [path.join("data", "generate.py")]);
run(venvPy, ["-m", "app.predict.train"]);

if (!existsSync(path.join(root, ".env"))) {
  console.warn("\nNo .env found. Copy .env.example to .env and set DATABASE_URL, then run `pnpm db:init`.");
} else if (!run(venvPy, [path.join("backend", "db", "init_db.py")], { allowFail: true })) {
  console.warn("\nDatabase init failed. Check DATABASE_URL in .env, then run `pnpm db:init`. The app still runs without it.");
}

run("pnpm", ["install"]);
run("pnpm", ["install"], { cwd: path.join(root, "frontend") });

console.log("\nSetup done. Start everything with: pnpm dev  (API :8000, dashboard :3000)");
