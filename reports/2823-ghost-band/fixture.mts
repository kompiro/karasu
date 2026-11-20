// SPIKE #2823: render the fixture's entity view and service view from a checkout.
// Run: pnpm exec tsx reports/2823-ghost-band/fixture.mts <repoRoot> <outPrefix>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [root, out] = process.argv.slice(2);
const core = await import(join(root!, "packages/core/src/index.ts"));
const src = readFileSync(new URL("./index.krs", import.meta.url), "utf8");
const ev = core.renderEntityView(src, ["Shop", "Commerce", "Ordering"]);
writeFileSync(`${out}.entity.svg`, ev.svg);
const sv = core.compile(src, { viewPath: ["Shop", "Commerce"] });
writeFileSync(`${out}.service.svg`, sv.svg);
const errs = (sv.diagnostics ?? sv.errors ?? []).filter?.((d: { severity?: string }) => d.severity === "error") ?? [];
console.log("errors:", JSON.stringify(errs).slice(0, 400));
