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
// 3. Stage the app the npm package ships with the CLI's own `build:app` (what
//    `prepack` runs): the serve build, copied into `packages/cli/dist/app/`,
//    where `findAppDistDir` looks first. Serving the regular app build from
//    `packages/app/dist` instead tests a build users do not get, and that build
//    picks serve mode by probing `/api/files` with a 200ms timeout, which the
//    cold first request can miss and boot OPFS mode (#3303, TPL-1024).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVE_FIXTURE_DIR, SERVE_PORT, SERVE_SCRATCH_DIR } from "../fixtures/serve-env.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const stagedAppIndex = fileURLToPath(new URL("../../cli/dist/app/index.html", import.meta.url));
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

run(["--filter", "karasu", "run", "build"]);
run(["--filter", "karasu", "run", "build:app"]);
// Without the staged app, `karasu serve` falls back to `packages/app/dist` (or
// answers 503), so a staging step that silently wrote nothing would put this
// project back on the regular app build.
if (!existsSync(stagedAppIndex)) {
  process.stderr.write(`start-serve: ${stagedAppIndex} is missing; build:app did not stage it\n`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [cliBundle, "serve", SERVE_SCRATCH_DIR, "--port", String(SERVE_PORT)],
  { cwd: repoRoot, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
