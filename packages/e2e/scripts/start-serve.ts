// Starts `karasu serve` for the Playwright `serve` project (#3049). Run by the
// second `webServer` entry in `playwright.config.ts`, which exists only when
// `E2E_SERVE=1` (the nightly).
//
// 1. Copy `fixtures/serve-project/` into the scratch dir, so every start sees
//    the checked-in content and a test that rewrites a file never edits a
//    tracked one.
// 2. Build the CLI bundle with its own `build` script and run that bundle. The
//    source cannot be run with `tsx` on a fresh install: `@karasu-tools/core`
//    and `@karasu-tools/i18n` resolve to `dist/`, which nothing has built.
// 3. The bundle finds the app at `packages/app/dist` (`findAppDistDir`). In CI
//    the first `webServer` entry has just built it (entries start in order);
//    locally that entry is `vite` dev, so build it here first.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVE_FIXTURE_DIR, SERVE_PORT, SERVE_SCRATCH_DIR } from "../fixtures/serve-env.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appIndex = fileURLToPath(new URL("../../app/dist/index.html", import.meta.url));
const cliBundle = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));

function run(args: string[]): void {
  const result = spawnSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(`start-serve: \`pnpm ${args.join(" ")}\` failed\n`);
    process.exit(result.status ?? 1);
  }
}

rmSync(SERVE_SCRATCH_DIR, { recursive: true, force: true });
cpSync(SERVE_FIXTURE_DIR, SERVE_SCRATCH_DIR, { recursive: true });

if (!process.env.CI) run(["--filter", "@karasu-tools/app", "exec", "vite", "build"]);
// Without the app, `karasu serve` answers 503 and Playwright would wait out
// the whole webServer timeout before saying why.
if (!existsSync(appIndex)) {
  process.stderr.write(`start-serve: ${appIndex} is missing; the app build did not run\n`);
  process.exit(1);
}

run(["--filter", "karasu", "run", "build"]);

const child = spawn(
  process.execPath,
  [cliBundle, "serve", SERVE_SCRATCH_DIR, "--port", String(SERVE_PORT)],
  { cwd: repoRoot, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
