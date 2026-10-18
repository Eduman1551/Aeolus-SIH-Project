// Start the FastAPI backend on :8000 using the project venv.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPython } from "./run-py.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reload = process.argv.includes("--no-reload") ? [] : ["--reload", "--reload-dir", path.join(root, "backend", "app")];

runPython(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", process.env.API_PORT || "8000", ...reload]);
