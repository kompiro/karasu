// Generates the markdown body for a periodic TPL deprecation-review Issue.
//
// Reads docs/test-perspectives/, filters TPLs whose status is "active",
// and emits to stdout: an introduction, a per-TPL checklist with the three
// review questions from #1204, and a disposition legend. The scheduled
// `tpl-review` workflow pipes this into `gh issue create --body-file -`.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter, type Frontmatter } from "./validate.ts";

const cwd = process.cwd();
const tplDir = resolve(cwd, "docs/test-perspectives");

interface ActiveTpl {
  id: string;
  title: string;
  topic: string;
  file: string;
}

const entries = readdirSync(tplDir)
  .filter((f) => /^TPL-\d{8}-\d{2}-.+\.md$/.test(f))
  .sort();

const active: ActiveTpl[] = [];
for (const file of entries) {
  const content = readFileSync(join(tplDir, file), "utf8");
  const { fm } = parseFrontmatter(content);
  if (!fm || typeof fm !== "object") continue;
  const f = fm as Partial<Frontmatter>;
  if (f.status !== "active") continue;
  if (typeof f.id !== "string" || typeof f.title !== "string" || typeof f.topic !== "string") {
    continue;
  }
  active.push({ id: f.id, title: f.title, topic: f.topic, file });
}

const periodLabel = (() => {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  // Apr/May → H1, Oct/Nov → H2; fall back to current half by month.
  return month <= 6 ? `${year}-H1` : `${year}-H2`;
})();

const lines: string[] = [];
lines.push(`# TPL deprecation review — ${periodLabel}`);
lines.push("");
lines.push(
  "Periodic semi-annual review of every `active` TPL in `docs/test-perspectives/`. " +
    "For each entry, decide a disposition (`keep` / `update` / `deprecate`) using the three questions below.",
);
lines.push("");
lines.push("## Review questions (per TPL)");
lines.push("");
lines.push(
  "1. Does the cited `root_cause_file` (or `root_cause_adr`) still exist? " +
    "Has the function / pattern survived?",
);
lines.push(
  "2. Has the architectural assumption changed " +
    '(e.g. "user stylesheets always last" → "mode-locked properties bypass user sheets")?',
);
lines.push(
  "3. Is there a more current TPL that subsumes this one " +
    "(deprecate as `superseded_by`, mirroring ADR)?",
);
lines.push("");
lines.push("## Dispositions");
lines.push("");
lines.push("- **keep** — still applicable, no edits needed");
lines.push(
  "- **update** — still applicable but checklist / known-patterns / related tests need refresh",
);
lines.push(
  "- **deprecate** — root cause structurally eliminated; flip `status: deprecated` and append rationale " +
    "(see `docs/test-perspectives/README.md`)",
);
lines.push("");
lines.push(`## Active TPLs (${active.length})`);
lines.push("");

const repo = process.env.GITHUB_REPOSITORY ?? "kompiro/karasu";
const fileBaseUrl = `https://github.com/${repo}/blob/main/docs/test-perspectives`;

if (active.length === 0) {
  lines.push("_No active TPLs — nothing to review._");
} else {
  for (const t of active) {
    lines.push(`- [ ] [${t.id}](${fileBaseUrl}/${t.file}) — ${t.title} _(topic: \`${t.topic}\`)_`);
  }
}

lines.push("");
lines.push("## Procedure");
lines.push("");
lines.push(
  "See `docs/test-perspectives/README.md` 「定期 deprecation レビュー」 section for the full procedure. " +
    "When the review is complete, close this Issue with a summary comment listing the dispositions taken " +
    "(e.g. `keep: 18`, `update: 1`, `deprecate: 1`).",
);
lines.push("");

process.stdout.write(`${lines.join("\n")}\n`);
