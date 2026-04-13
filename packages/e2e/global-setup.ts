import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build the `karasu` CLI (and its workspace dependencies) exactly once before
 * the Playwright workers start. Specs that exercise the CLI binary can then
 * rely on `packages/cli/dist/index.js` being fresh without each worker
 * racing to rebuild it.
 */
export default async function globalSetup() {
  execFileSync("pnpm", ["--filter", "karasu...", "build"], {
    cwd: resolve(__dirname, "../.."),
    stdio: "ignore",
  });
}
