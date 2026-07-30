/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
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

function readTopics(root: string, file: string): string[] {
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

function main(): void {
  const { missingFromTpl, missingFromAdr, orderDiffers } = check(process.cwd());

  if (missingFromTpl.length === 0 && missingFromAdr.length === 0 && !orderDiffers) {
    console.log("config-topics-sync: ok (adr.config.json and tpl.config.json agree on topics)");
    return;
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
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /config-topics-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
