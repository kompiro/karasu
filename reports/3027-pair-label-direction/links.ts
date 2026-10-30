// Prints share links that open the #3027 samples in a karasu app at <origin>, one per pair-cue mode.
// Run: pnpm exec tsx reports/3027-pair-label-direction/links.ts <origin>
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeShare } from "../../packages/app/src/utils/inline-share.ts";

const here = dirname(fileURLToPath(import.meta.url));
const origin = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const samples = [
  { name: "Small sample (Shop.ShopApp)", krs: readFileSync(resolve(here, "pair-sample.krs"), "utf8"), node: "ShopApp" },
  {
    name: "Umami fixture (Umami.UmamiApp)",
    krs: readFileSync(resolve(here, "../../packages/core/src/renderer/fixtures/dense-domain-canvas.krs"), "utf8"),
    node: "UmamiApp",
  },
];
for (const s of samples) {
  const enc = encodeShare({ krs: s.krs, target: { view: "system", node: s.node } });
  console.log(`\n${s.name}`);
  for (const mode of ["off", "position", "arrow"]) console.log(`  ${mode}: ${origin}/?pairCue=${mode}#s=${enc}`);
}
