/* eslint-disable no-console -- spike script */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 * Round-robins `allviews-once.ts` over the ladder configurations, N rounds, and
 * keeps each configuration's fastest run — one fresh process per measurement so
 * no configuration inherits another's JIT state.
 *
 *   pnpm tsx reports/width-budget-ladder/allviews-sweep.ts <file.krs> [rounds]
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

interface Run {
  totalMs: number;
  extraCandidateMs: number;
  firstCandidateMs: number;
  candidates: number;
}

const file = process.argv[2];
const rounds = Number(process.argv[3] ?? 5);
if (!file) throw new Error("usage: allviews-sweep.ts <file.krs> [rounds]");

const best = new Map<string, Run>();
const all = new Map<string, number[]>();
for (let round = 0; round < rounds; round++) {
  for (const { id, env } of ENVS) {
    const out = execFileSync(
      "npx",
      ["tsx", "reports/width-budget-ladder/allviews-once.ts", file, "7"],
      { encoding: "utf8", env: { ...process.env, KARASU_SPIKE_LADDER: env } },
    );
    const run = JSON.parse(out.trim()) as Run;
    all.set(id, [...(all.get(id) ?? []), run.totalMs]);
    if (!best.has(id) || run.totalMs < best.get(id)!.totalMs) best.set(id, run);
  }
  console.log(`round ${round + 1} done`);
}

const rows = ENVS.map(({ id }) => ({
  id,
  ...best.get(id)!,
  spread: all.get(id)!.map((v) => Number(v.toFixed(1))),
}));
writeFileSync(
  "reports/width-budget-ladder/allviews.json",
  `${JSON.stringify({ file, rounds, rows }, null, 2)}\n`,
);
for (const r of rows) {
  console.log(
    `${r.id.padEnd(10)} total ${r.totalMs.toFixed(1)} ms  extra ${r.extraCandidateMs.toFixed(1)} ms  ` +
      `candidates ${r.candidates}  spread ${r.spread.join(" / ")}`,
  );
}
