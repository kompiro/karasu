/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the `topics` vocabulary duplicated across adr.config.json and
// tpl.config.json (Issue #2083).
//
// The two files used to be one: `pnpm tpl:validate` was pointed at
// adr.config.json so ADRs and TPLs shared a single `topics` list. They were
// split when ADRs moved to `issue-number` while TPLs stayed on
// `date-sequence`, because @kompiro/adr-tools and @kompiro/tpl-tools read the
// SAME config key, `idFormat` (ADR-2092). TPLs later moved to `issue-number`
// too (#2188 / ADR-2188), so the formats agree again — but the split stays:
// per-tool config means one tool's settings change can never break the other
// corpus's validation.
//
// Splitting the file duplicated `topics`, which is a silent-drift hazard: add
// a topic to adr.config.json only, and a TPL using it fails validation with a
// vocabulary error that points nowhere near the cause. This check makes the
// duplication loud instead.
//
// `idFormat` is deliberately NOT compared — the two configs are allowed to
// evolve independently; that independence is the point of the split.
//
// The repo's `topic: <name>` Issue labels are a third copy of the same
// vocabulary (Issue #3314). They live on GitHub, so `--labels` compares them
// too, through the API; without the flag the check stays offline for the
// pre-push hook. CI runs the flag on the PRs and main pushes that change
// topics (.github/workflows/adr-validate.yml).

export const ADR_CONFIG = "adr.config.json";
export const TPL_CONFIG = "tpl.config.json";

export interface TopicsDrift {
  /** In adr.config.json but missing from tpl.config.json. */
  missingFromTpl: string[];
  /** In tpl.config.json but missing from adr.config.json. */
  missingFromAdr: string[];
  /** Same members, but declared in a different order. */
  orderDiffers: boolean;
}

export const LABEL_PREFIX = "topic: ";

export interface LabelsDrift {
  /** A topic in adr.config.json with no `topic: <name>` label. */
  missingLabels: string[];
  /** A `topic:` label whose name is not a topic in adr.config.json. */
  strayLabels: string[];
}

export function readTopics(root: string, file: string): string[] {
  const raw = readFileSync(join(root, file), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${file}: expected a JSON object`);
  }
  const topics = (parsed as { topics?: unknown }).topics;
  if (!Array.isArray(topics) || !topics.every((t) => typeof t === "string")) {
    throw new Error(`${file}: "topics" must be an array of strings`);
  }
  return topics;
}

export function check(root: string): TopicsDrift {
  const adr = readTopics(root, ADR_CONFIG);
  const tpl = readTopics(root, TPL_CONFIG);
  const adrSet = new Set(adr);
  const tplSet = new Set(tpl);

  return {
    missingFromTpl: adr.filter((t) => !tplSet.has(t)),
    missingFromAdr: tpl.filter((t) => !adrSet.has(t)),
    // Order is compared only when the membership already agrees, so a genuine
    // add/remove reports as such rather than as a confusing ordering diff.
    orderDiffers:
      adr.length === tpl.length &&
      adr.every((t) => tplSet.has(t)) &&
      adr.some((t, i) => tpl[i] !== t),
  };
}

/**
 * Compares the union of both sides (TPL-1415): every topic needs its label,
 * and every label that looks like a topic label needs its topic. A label
 * spelled `topic:x` (no space) or `Topic: x` cannot be a configured topic's
 * label, so it reports as stray rather than slipping past the prefix match
 * (GitHub label names are case-insensitive).
 */
export function checkLabels(topics: string[], labelNames: string[]): LabelsDrift {
  const expected = new Set(topics.map((t) => LABEL_PREFIX + t));
  const prefix = LABEL_PREFIX.trimEnd();
  const topicLabels = labelNames.filter((n) => n.toLowerCase().startsWith(prefix));
  const present = new Set(topicLabels);
  return {
    missingLabels: [...expected].filter((l) => !present.has(l)).sort(),
    strayLabels: topicLabels.filter((l) => !expected.has(l)).sort(),
  };
}

// `{owner}/{repo}` resolves from the checkout's remote, or from GH_REPO when set.
function readRepoLabels(): string[] {
  const out = execFileSync(
    "gh",
    ["api", "--paginate", "repos/{owner}/{repo}/labels?per_page=100", "--jq", ".[].name"],
    { encoding: "utf8" },
  );
  return out.split("\n").filter((l) => l !== "");
}

function reportLabels(root: string, labelNames: string[]): boolean {
  const { missingLabels, strayLabels } = checkLabels(readTopics(root, ADR_CONFIG), labelNames);
  if (missingLabels.length === 0 && strayLabels.length === 0) {
    console.log(`config-topics-sync: ok (topic: labels match ${ADR_CONFIG} topics)`);
    return true;
  }
  console.error(`config-topics-sync: topic: labels have drifted from ${ADR_CONFIG} topics:`);
  for (const l of missingLabels) {
    console.error(`✗ "${l}" has no label (gh label create "${l}", or gh label edit the old name)`);
  }
  for (const l of strayLabels) {
    console.error(
      `✗ "${l}" is not a topic (gh label edit it to a topic, or move its Issues and gh label delete it)`,
    );
  }
  console.error(
    `\nDo label operations before the PR that changes topics merges (.claude/rules/adr-topics.md).`,
  );
  return false;
}

function reportConfigs(root: string): boolean {
  const { missingFromTpl, missingFromAdr, orderDiffers } = check(root);

  if (missingFromTpl.length === 0 && missingFromAdr.length === 0 && !orderDiffers) {
    console.log("config-topics-sync: ok (adr.config.json and tpl.config.json agree on topics)");
    return true;
  }

  console.error("config-topics-sync: topics vocabulary has drifted between the two configs:");
  for (const t of missingFromTpl) {
    console.error(`✗ "${t}" is in ${ADR_CONFIG} but missing from ${TPL_CONFIG}`);
  }
  for (const t of missingFromAdr) {
    console.error(`✗ "${t}" is in ${TPL_CONFIG} but missing from ${ADR_CONFIG}`);
  }
  if (orderDiffers) {
    console.error(`✗ both files list the same topics but in a different order`);
  }
  console.error(
    `\nThe two files intentionally differ on "idFormat" only (see Issue #2083). ` +
      `Keep "topics" identical — add the topic to both files, in the same order.`,
  );
  return false;
}

/**
 * Returns the exit code. The label source is injectable so the contract the
 * required check depends on (any drift exits 1; no `--labels`, no API call)
 * is testable without GitHub.
 */
export function run(
  argv: string[],
  root: string,
  readLabels: () => string[] = readRepoLabels,
): number {
  const configsOk = reportConfigs(root);
  const labelsOk = argv.includes("--labels") ? reportLabels(root, readLabels()) : true;
  return configsOk && labelsOk ? 0 : 1;
}

function main(): void {
  process.exitCode = run(process.argv.slice(2), process.cwd());
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /config-topics-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
