// SPIKE #2823: render the band frame looks side by side.
// Run: pnpm exec tsx reports/2823-band-frame/render.mts <repoRoot> <outPrefix> [ghost|legible] [theme]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [root, out, look, theme] = process.argv.slice(2);
const core = await import(join(root!, "packages/core/src/index.ts"));
if (look) {
  const frame = await import(join(root!, "packages/core/src/renderer/container-frame.ts"));
  frame.setBandFrameLook(look);
}
const fixture = readFileSync(new URL("./index.krs", import.meta.url), "utf8");
const t = theme ?? "dark";
writeFileSync(`${out}.fixture-entity.svg`, core.renderEntityView(fixture, ["Shop", "Commerce", "Ordering"], undefined, undefined, undefined, t).svg);
writeFileSync(`${out}.fixture-service.svg`, core.compile(fixture, { viewPath: ["Shop", "Commerce"], theme: t }).svg);
const dify = "/workspaces/dify/index.krs";
try {
  writeFileSync(`${out}.dify-identity.svg`, core.renderEntityView(readFileSync(dify, "utf8"), ["Dify", "ApiBackend", "IdentityAccess"], undefined, undefined, undefined, t).svg);
} catch (e) { console.error("dify skipped", (e as Error).message); }
