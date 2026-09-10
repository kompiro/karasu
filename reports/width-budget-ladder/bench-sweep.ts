/* eslint-disable no-console -- spike script */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 *
 * Wall time per ladder configuration, from the repo's own benchmark rather
 * than an in-process timer: `pnpm bench:render <file> --runs 5`, once per
 * configuration per round, three rounds round-robin so machine drift lands on
 * every configuration equally. Reports the minimum of the three best-of-5
 * numbers for `buildAllViewsSvg` and for the single system view.
 *
 *   pnpm tsx reports/width-budget-ladder/bench-sweep.ts <file.krs> [rounds]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const ENVS: Array<{ id: string; env: string }> = [
  { id: "today", env: "steps=12,maxMultiple=6,patience=off" },
  { id: "steps8", env: "steps=8,maxMultiple=6,patience=off" },
  { id: "steps6", env: "steps=6,maxMultiple=6,patience=off" },
  { id: "steps4", env: "steps=4,maxMultiple=6,patience=off" },
  { id: "steps3", env: "steps=3,maxMultiple=6,patience=off" },
  { id: "steps6m2", env: "steps=6,maxMultiple=2,patience=off" },
  { id: "floor", env: "steps=1,maxMultiple=6,patience=off" },
  { id: "patience1", env: "steps=12,maxMultiple=6,patience=1" },
  { id: "patience2", env: "steps=12,maxMultiple=6,patience=2" },
];

const file = process.argv[2];
const rounds = Number(process.argv[3] ?? 3);
if (!file) throw new Error("usage: bench-sweep.ts <file.krs> [rounds]");

const best = new Map<string, { allViews: number; system: number }>();
for (let round = 0; round < rounds; round++) {
  for (const { id, env } of ENVS) {
    const out = execFileSync("npx", ["tsx", "scripts/bench/render.ts", file, "--runs", "5"], {
      encoding: "utf8",
      env: { ...process.env, KARASU_SPIKE_LADDER: env },
      maxBuffer: 32 * 1024 * 1024,
    });
    const pick = (needle: string): number => {
      const line = out.split("\n").find((l) => l.includes(needle));
      const m = line && /([\d.]+) ms/.exec(line);
      if (!m) throw new Error(`bench:render: no "${needle}" line`);
      return Number(m[1]);
    };
    const allViews = pick("buildAllViewsSvg");
    const system = pick("diagramType");
    const seen = best.get(id);
    best.set(id, {
      allViews: Math.min(seen?.allViews ?? Infinity, allViews),
      system: Math.min(seen?.system ?? Infinity, system),
    });
    console.log(`round ${round + 1} ${id.padEnd(10)} allViews ${allViews.toFixed(1)} ms  system ${system.toFixed(1)} ms`);
  }
}

const rows = ENVS.map(({ id }) => ({ id, ...best.get(id)! }));
writeFileSync("reports/width-budget-ladder/bench.json", `${JSON.stringify({ file, rounds, rows }, null, 2)}\n`);
console.log("");
for (const r of rows) {
  console.log(`${r.id.padEnd(10)} allViews ${r.allViews.toFixed(1)} ms  system ${r.system.toFixed(1)} ms`);
}
