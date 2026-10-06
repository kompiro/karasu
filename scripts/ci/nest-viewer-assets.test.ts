import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences how karasu-nest publishes the gallery viewer (#2998, TPL-2993).
//
// The staged `viewer.html` carries the viewer's script, and the nest origin
// holds the session cookie. Served there as a page of its own, without the
// sandbox `/g/<id>` adds, that script would run with the session's authority.
// `wrangler.toml` prevents it by sending every path except `/assets/*` to the
// Worker first, which never serves the template bare. Nothing else would
// notice the day that line is loosened: the unit tests fake the binding, and
// the page still works.
//
// The deploy also has to stage the viewer before wrangler runs, or the assets
// directory does not exist.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

/** The `[assets]` table's own lines, up to the next table. */
function assetsTable(): string {
  const toml = read("packages/nest/wrangler.toml");
  const start = toml.indexOf("\n[assets]\n");
  expect(start).toBeGreaterThan(-1);
  const rest = toml.slice(start + "\n[assets]\n".length);
  const end = rest.search(/^\[/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("karasu-nest viewer assets", () => {
  it("serves only /assets/* statically; everything else reaches the Worker first", () => {
    const table = assetsTable();
    expect(table).toMatch(/^run_worker_first = \["\/\*", "!\/assets\/\*"\]$/m);
    expect(table).toMatch(/^html_handling = "none"$/m);
    expect(table).toMatch(/^not_found_handling = "none"$/m);
    expect(table).toMatch(/^binding = "ASSETS"$/m);
  });

  it("stages the viewer before the deploy step", () => {
    const workflow = read(".github/workflows/nest-deploy.yml");
    const stage = workflow.indexOf("pnpm --filter @karasu-tools/nest run build:viewer");
    const deploy = workflow.indexOf("cloudflare/wrangler-action@");
    expect(stage).toBeGreaterThan(-1);
    expect(stage).toBeLessThan(deploy);
  });
});
