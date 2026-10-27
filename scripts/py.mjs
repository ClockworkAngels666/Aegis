// Runs Python with the project's virtual environment (.venv), so npm scripts work without
// activating it first: `node scripts/py.mjs -m pytest -q`. Used by "dev:api" and "test".
//
// `--watch <dir>` restarts the process when a .py file under <dir> changes. This replaces
// uvicorn's --reload, which on Windows restarts by sending Ctrl+C to the whole console and
// so also stops npm and the web server running next to it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const candidates = [
  join(root, ".venv", "Scripts", "python.exe"),
  join(root, ".venv", "bin", "python"),
  "python3",
  "python",
];
const python = candidates.find((p) => {
  if (p.includes(".venv")) return existsSync(p);
  return spawnSync(p, ["-c", "import fastapi, uvicorn"], { stdio: "ignore" }).status === 0;
});

if (!python) {
  console.error(
    "\nNo Python environment with FastAPI found. Create one in this folder:\n\n" +
      "  python -m venv .venv\n" +
      "  .venv/Scripts/pip install -r requirements-dev.txt   (macOS/Linux: .venv/bin/pip)\n",
  );
  process.exit(1);
}

let args = process.argv.slice(2);
let watchDir = null;
if (args[0] === "--watch") {
  watchDir = join(root, args[1]);
  args = args.slice(2);
}

let child = null;
let restarting = false;
const start = () => {
  child = spawn(python, args, { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => {
    if (restarting) {
      restarting = false;
      start();
    } else if (!watchDir) {
      process.exit(code ?? 0);
    }
  });
};
start();

if (watchDir) {
  let timer = null;
  watch(watchDir, { recursive: true }, (_event, file) => {
    if (!file || !file.endsWith(".py")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n[py] ${file} changed, restarting…`);
      restarting = true;
      child.kill();
    }, 250);
  });
}

const stop = () => {
  restarting = false;
  child?.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
