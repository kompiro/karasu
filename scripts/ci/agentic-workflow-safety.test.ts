import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the write scope of the agentic workflows (`.github/workflows/*.md`,
// compiled by `gh aw compile` into the sibling `.lock.yml`).
//
// What keeps an agent from merging a dependency PR is not the sentence in its
// prompt telling it not to: it is the set of safe outputs declared in the
// frontmatter, because that is the only thing the compiled workflow can
// actually perform. A prompt is advice; the declaration is the fence. Adding
// `merge-pull-request` or `push-to-pull-request-branch` to a workflow that
// still *says* "you do not change the repository" would read as safe in review
// and be anything but (TPL-2658).
//
// The second half is drift. The prompt body is pulled from the Markdown at
// runtime (`{{#runtime-import}}`), so body edits need no recompile, but the
// frontmatter is baked into the lock file: a frontmatter edit that was never
// compiled leaves the repository describing one fence and running another.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/**
 * Safe outputs the agentic workflows may declare: they add prose next to the
 * work (a comment, an issue) and report what the agent could not do. Everything
 * else in gh-aw's catalogue moves the repository or the review state on its own
 * (merging, pushing, closing, dispatching), and this repository keeps those with
 * the maintainer: ADR-903 for why the runs stay out of bot context, and
 * `.claude/rules/dependabot.md` for the verdict vocabulary being a human's.
 */
const ALLOWED_SAFE_OUTPUTS = [
  "add-comment",
  "create-issue",
  "missing-tool",
  "missing-data",
  "noop",
];

/**
 * The one permission allowed to be `write`. It authorizes inference requests
 * against the account's Copilot subscription through `GITHUB_TOKEN` and grants
 * nothing over the repository; without it the copilot engine cannot run at all,
 * and the alternative is carrying a personal access token in a secret. Every
 * other permission has to be `read`.
 */
const INFERENCE_PERMISSION = "copilot-requests";

/**
 * `safe-outputs.threat-detection` is the one key of that section which is not
 * an output: it tunes the scan that gates the outputs. It is filtered out of
 * the safe-output checks below and guarded on its own instead.
 */
const THREAT_DETECTION = "threat-detection";

/**
 * The `safe_outputs` job condition gh-aw compiles today, matched whole. A
 * substring test for the detection term would accept a disjunction that
 * bypasses it (`needs.detection.result == 'success' || true` contains the
 * term and is always true), so the whole expression is pinned instead.
 *
 * gh-aw changing this condition should be read and re-approved here rather
 * than pattern-matched around: it decides whether a failed detection job
 * stops the publish.
 */
const APPROVED_SAFE_OUTPUTS_CONDITION =
  "(!cancelled()) && needs.agent.result != 'skipped' && needs.detection.result == 'success'";

type Entry = { readonly key: string; readonly value: string };

type Workflow = {
  readonly name: string;
  readonly front: string;
  readonly lock: string;
  readonly safeOutputs: readonly string[];
  readonly permissions: readonly Entry[];
  readonly compiledTools: readonly string[];
};

/** The text between the opening and closing `---` of the Markdown frontmatter. */
function frontmatter(text: string): string {
  const lines = text.split("\n");
  if (lines[0] !== "---") return "";
  const end = lines.indexOf("---", 1);
  return end === -1 ? "" : lines.slice(1, end).join("\n");
}

/**
 * Entries nested one level under `section:` in the frontmatter. A line scan is
 * enough and keeps this guard dependency-free, matching its siblings
 * (`workflow-runner-policy.test.ts`). Commented-out keys do not count: gh-aw's
 * own template ships the whole safe-output catalogue commented out.
 */
function nestedEntries(front: string, section: string): Entry[] {
  const entries: Entry[] = [];
  let inSection = false;
  for (const line of front.split("\n")) {
    if (line === `${section}:`) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^\S/.test(line)) break;
    const match = /^ {2}([a-z][a-z0-9-]*):(.*)$/.exec(line);
    if (match) entries.push({ key: match[1], value: match[2].trim() });
  }
  return entries;
}

/**
 * The scalar at a nested frontmatter path, e.g.
 * `safe-outputs.threat-detection.engine.model`. Each level is indented two
 * spaces past the last, and `nestedEntries` only reaches the first of them.
 * A line scan is enough for the shapes read here and keeps the guard
 * dependency-free, matching its siblings.
 */
function scalarAt(front: string, path: readonly string[]): string | null {
  let lines = front.split("\n");
  for (const [depth, segment] of path.entries()) {
    const indent = " ".repeat(depth * 2);
    const header = `${indent}${segment}:`;
    const start = lines.findIndex((line) => line === header || line.startsWith(`${header} `));
    if (start === -1) return null;
    if (depth === path.length - 1) return lines[start].slice(header.length).trim();
    // Descend: the block ends at the first non-blank line indented no deeper
    // than `segment` itself, which keeps a later sibling of the same name out.
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.trim() !== "" && !line.startsWith(`${indent}  `));
    lines = end === -1 ? rest : rest.slice(0, end);
  }
  return null;
}

/**
 * The `detection:` job of the lock file. Everything below reads inside it
 * rather than across the whole file: the agent job carries keys of the same
 * name (`COPILOT_MODEL` above all), so a whole-file scan would compare the
 * wrong job's value the day someone pins the agent model too.
 */
function detectionJob(lock: string): string {
  const match = /^ {2}detection:$([\s\S]*?)(?=^ {2}\w)/m.exec(lock);
  return match === null ? "" : match[1];
}

/** Every value gh-aw baked in for the detection job's fail-open switch. */
function detectionContinueOnError(job: string): string[] {
  return [...job.matchAll(/GH_AW_DETECTION_CONTINUE_ON_ERROR: "(\w+)"/g)].map((match) => match[1]);
}

/**
 * The body of the `Conclude threat detection` step, which is the last step of
 * the detection job and therefore runs to the end of it.
 */
function concludeStep(job: string): string {
  const match =
    /^ {6}- name: Conclude threat detection$([\s\S]*?)(?=^ {6}- name: |$(?![\s\S]))/m.exec(job);
  return match === null ? "" : match[1];
}

/**
 * The `if:` condition of the `safe_outputs` job — the expression that decides
 * whether anything is published. Fail-closed only means something because this
 * reads the detection job's result: without it, failing the detection job would
 * stop nothing.
 */
function safeOutputsCondition(lock: string): string | null {
  const match = /^ {2}safe_outputs:$[\s\S]*?^ {4}if: (.*)$/m.exec(lock);
  return match === null ? null : match[1];
}

/** The model gh-aw baked into the detection job's engine invocation. */
function detectionModel(job: string): string | null {
  const match = /COPILOT_MODEL: (\S+)/.exec(job);
  return match === null ? null : match[1];
}

/**
 * The safe-output tools gh-aw baked into the lock file, taken from the line it
 * writes into the agent prompt: `Tools: add_comment(max:10), create_issue, ...`.
 */
function compiledTools(lock: string): string[] {
  const match = /Tools: ([^\\"]+)/.exec(lock);
  if (match === null) return [];
  return match[1].split(",").map((tool) => tool.trim().replace(/\(.*\)$/, ""));
}

const agenticSources = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

const workflows: Workflow[] = agenticSources.map((name) => {
  const front = frontmatter(readFileSync(join(WORKFLOW_DIR, name), "utf8"));
  const lockPath = join(WORKFLOW_DIR, name.replace(/\.md$/, ".lock.yml"));
  const lock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : "";
  return {
    name,
    front,
    lock,
    safeOutputs: nestedEntries(front, "safe-outputs")
      .map((entry) => entry.key)
      .filter((key) => key !== THREAT_DETECTION),
    permissions: nestedEntries(front, "permissions"),
    compiledTools: compiledTools(lock),
  };
});

describe("agentic workflow write scope", () => {
  it("finds the workflows it is meant to guard", () => {
    // Parser sanity: a reformat, or a rename of the frontmatter keys, would
    // otherwise make every assertion below pass over an empty set.
    expect(agenticSources.length).toBeGreaterThan(0);
    for (const workflow of workflows) {
      expect(workflow.safeOutputs.length, `${workflow.name} declares safe outputs`).toBeGreaterThan(
        0,
      );
      expect(workflow.permissions.length, `${workflow.name} declares permissions`).toBeGreaterThan(
        0,
      );
    }
  });

  it("declares only safe outputs that leave the decision with a human", () => {
    const unexpected = workflows.flatMap((workflow) =>
      workflow.safeOutputs
        .filter((output) => !ALLOWED_SAFE_OUTPUTS.includes(output))
        .map((output) => `${workflow.name} → ${output}`),
    );
    // Widening this list is a policy change, not a config tweak: say in the PR
    // which human decision the agent is taking over, and why that is right.
    expect(unexpected).toEqual([]);
  });

  it("asks for read permissions only, apart from paying for its own inference", () => {
    const writable = workflows.flatMap((workflow) =>
      workflow.permissions
        .filter(
          (permission) => permission.value !== "read" && permission.key !== INFERENCE_PERMISSION,
        )
        .map((permission) => `${workflow.name} → ${permission.key}: ${permission.value}`),
    );
    expect(writable).toEqual([]);
  });

  it("compiles every declared safe output into its lock file", () => {
    // The prompt body is imported at runtime, but the frontmatter is baked in.
    // A frontmatter edit that skipped `gh aw compile` shows up here.
    const missing = workflows.flatMap((workflow) =>
      workflow.safeOutputs
        .map((output) => output.replaceAll("-", "_"))
        .filter((tool) => !workflow.compiledTools.includes(tool))
        .map((tool) => `${workflow.name} → ${tool}`),
    );
    expect(missing).toEqual([]);
  });

  it("fails the run when threat detection cannot conclude", () => {
    // gh-aw defaults `continue-on-error` to true, and that default is what
    // makes the safety net worse than switching it off: the detection job
    // reports success after failing to reach a verdict, `safe_outputs` is
    // gated on `needs.detection.result == 'success'` and publishes output
    // nothing inspected, and the run summary stays green. Every run of these
    // two workflows has taken that path, first as `parse_error` and then as
    // `engine_error` (#2786), so the posture is declared rather than left at
    // the default — and declared here so it cannot be flipped back quietly.
    const failOpen = workflows.flatMap((workflow) => {
      const declared = scalarAt(workflow.front, [
        "safe-outputs",
        THREAT_DETECTION,
        "continue-on-error",
      ]);
      const findings: string[] = [];
      if (declared !== "false") {
        findings.push(`${workflow.name} → declares continue-on-error: ${declared ?? "(absent)"}`);
      }
      // The declaration only matters once compiled: gh-aw writes it into the
      // detection job as an environment variable and, separately, decides
      // whether to put `continue-on-error: true` on the steps that conclude.
      const job = detectionJob(workflow.lock);
      if (job === "") findings.push(`${workflow.name} → lock has no detection job`);
      const compiled = detectionContinueOnError(job);
      if (compiled.length === 0) {
        // An absent variable is not a passing check. If gh-aw renames it the
        // loop below would iterate over nothing and the guard would go quiet
        // on exactly the property it exists to hold (TPL-2804).
        findings.push(`${workflow.name} → lock omits GH_AW_DETECTION_CONTINUE_ON_ERROR`);
      }
      for (const value of compiled) {
        if (value !== "false") {
          findings.push(
            `${workflow.name} → lock carries GH_AW_DETECTION_CONTINUE_ON_ERROR: ${value}`,
          );
        }
      }
      const conclude = concludeStep(job);
      if (conclude === "") {
        findings.push(`${workflow.name} → lock has no Conclude threat detection step`);
      } else if (/continue-on-error:/.test(conclude)) {
        // Any `continue-on-error` at all, not just the literal `true`: the
        // claim being held is that the step carries none, and `"true"` or an
        // expression would otherwise read as compliant.
        findings.push(`${workflow.name} → Conclude threat detection carries continue-on-error`);
      }
      // The other half of the posture: a detection job that fails only stops
      // the publish while `safe_outputs` is gated on its result. Note this
      // gates `safe_outputs` alone — gh-aw's `conclusion` job runs on
      // `always()` and can still open an issue from the agent's own
      // missing-tool / incomplete reports, which ADR-2786 records as the
      // residual exposure rather than claiming it away.
      const condition = safeOutputsCondition(workflow.lock);
      if (condition !== APPROVED_SAFE_OUTPUTS_CONDITION) {
        findings.push(
          `${workflow.name} → safe_outputs condition is not the approved one: ${condition ?? "(absent)"}`,
        );
      }
      return findings;
    });
    expect(failOpen).toEqual([]);
  });

  it("compiles the declared detection model into its lock file", () => {
    // The workflows pin a concrete model because the copilot harness refuses
    // to start when it cannot resolve the `detection` alias against the model
    // catalog (ADR-2786). The pin is required rather than optional: treating
    // an absent one as nothing to check would let "pin deleted, lock never
    // recompiled" pass, which is the very edit the workflow comment invites.
    // Going back to the alias is a deliberate change to this guard too.
    const drifted = workflows.flatMap((workflow) => {
      const pinned = scalarAt(workflow.front, [
        "safe-outputs",
        THREAT_DETECTION,
        "engine",
        "model",
      ]);
      if (pinned === null) return [`${workflow.name} → declares no detection engine model`];
      const compiled = detectionModel(detectionJob(workflow.lock));
      return compiled === pinned
        ? []
        : [`${workflow.name} → pins ${pinned}, lock runs ${compiled}`];
    });
    expect(drifted).toEqual([]);
  });
});
