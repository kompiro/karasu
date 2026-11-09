import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asMap,
  globToRegExp,
  jobs,
  parseYaml,
  pullRequestFilter,
  readWorkflow,
  ROOT,
  shellCommands,
  startsOn,
  trackedFiles,
  workflowFiles,
} from "./workflow-yaml";

// A check in `lefthook.yml` protects only the developer who has the hook
// installed. What protects `main` is the CI side, and the two drift apart in
// two ways: CI runs a different (often narrower) command than the hook
// (TPL-2446 — then the hook is the only gate for the difference, which counts
// as no gate), or CI starts on fewer files than the hook fires on (TPL-1480 —
// a PR touching only those files merges with the check never run).
//
// The closed set is the hook commands in `lefthook.yml`: the first test fails
// until a new command has an entry in `PARITY`. For each entry this derives,
// rather than trusts, the CI side: the PR workflows that run the same command
// (root `package.json` scripts expanded, so `pnpm gen:icons --check` and
// `tsx scripts/icons/gen-builtin-icons.ts --check` are the same command), plus
// the ones that run the declared vitest mirror. Then, over every tracked file,
// a file the hook fires on must start at least one of those workflows. The
// table holds only what a program cannot decide: why a command differs and
// which side is wider, why a file the hook fires on starts no CI run, and why a
// hook has no CI side at all.

interface Parity {
  /**
   * CI runs one of these commands instead of the hook's. `reason` says which
   * side is wider and why the difference is not a gap.
   */
  readonly ci?: { readonly commands: readonly string[]; readonly reason: string };
  /** A vitest file under `scripts/` that runs the same check in CI's test step. */
  readonly mirror?: string;
  /**
   * Tracked files the hook fires on that start no PR run of the check, and why
   * that is not a gap, or that it is one.
   */
  readonly uncovered?: { readonly globs: readonly string[]; readonly reason: string };
  /** The hook has no CI counterpart, and why. */
  readonly localOnly?: string;
}

/** What `ci.yml` ignores and only `ci-skip.yml` (which runs two scans) starts on. */
const DOCS_ONLY = ["docs/**", "**/*.md", ".claude/**"];

/**
 * Why a check that runs only in `ci.yml` may skip the docs-only paths. Every
 * merge to main still runs it: `ci.yml`'s `push` trigger has no path filter.
 */
const NOT_AN_INPUT =
  "The check reads TypeScript sources, manifests and configs, none of which sit under the docs-only paths. Each merge to main runs it again from ci.yml's unfiltered push trigger.";

const PARITY: Record<string, Parity> = {
  "pre-commit refuse-commit-on-main": {
    localOnly:
      "Guards the local checkout, not the change: CI never sees a commit made on local main, and branch protection refuses a push to main.",
  },
  "pre-merge-commit refuse-commit-on-main": {
    localOnly: "The same script for a `git pull` merge on local main; see the pre-commit entry.",
  },
  "pre-push gitleaks": {
    ci: {
      commands: ["gitleaks detect --source . --redact --no-banner --exit-code 1"],
      reason:
        "The same scan. The hook's other lines only fail loudly when gitleaks is not installed locally.",
    },
  },
  "pre-push format": {
    uncovered: {
      globs: DOCS_ONLY,
      reason:
        "A gap for Markdown: oxfmt checks `packages/**/*.md` and `scripts/**/*.md` (outside `packages/skills/skills`), and a PR that touches only such files never runs it. It is reported on main by the push run. The rest of the docs-only paths are outside `packages/` and `scripts/`, which is all the command reads.",
    },
  },
  "pre-push lint": { uncovered: { globs: DOCS_ONLY, reason: NOT_AN_INPUT } },
  "pre-push typecheck": { uncovered: { globs: DOCS_ONLY, reason: NOT_AN_INPUT } },
  "pre-push knip": { uncovered: { globs: DOCS_ONLY, reason: NOT_AN_INPUT } },
  "pre-push check-cycles": { uncovered: { globs: DOCS_ONLY, reason: NOT_AN_INPUT } },
  "pre-push adr-validate": {},
  "pre-push adr-generated-check": {
    ci: {
      commands: ['tsx scripts/adr/check-generated.ts --base "$BASE" --head "$HEAD_SHA"'],
      reason:
        "The same check. The hook diffs against the local origin/main because it has no PR; CI diffs the PR's base and head. Neither side is wider.",
    },
  },
  "pre-push adr-check-assumptions": {
    ci: {
      commands: ["adr check-assumptions --quiet", "adr check-assumptions"],
      reason:
        "reference-docs-check.yml runs it without `--quiet`, which changes only how much it prints.",
    },
    uncovered: {
      globs: DOCS_ONLY,
      reason:
        "A gap for assumptions that name a docs or Markdown path outside the ADR, TPL and reference docs paths: a PR that edits only that file does not run the check. It is reported on main by ci.yml's push run.",
    },
  },
  "pre-push tpl-validate": {
    uncovered: {
      globs: DOCS_ONLY,
      reason:
        "The TPL records are covered (docs/test-perspectives/** starts at-check-coverage.yml). What is left is a gap for a TPL code span naming a Markdown file under `packages/` or `scripts/`, renamed by a Markdown-only PR. It is reported on main by ci.yml's push run.",
    },
  },
  "pre-push config-topics-sync": { mirror: "scripts/lint/config-topics-sync.test.ts" },
  "pre-push vitest-projects-sync": { mirror: "scripts/lint/vitest-projects-sync.test.ts" },
  "pre-push record-source-paths": {
    mirror: "scripts/lint/record-source-paths.test.ts",
    uncovered: {
      globs: DOCS_ONLY,
      reason:
        "The records it reads (docs/acceptance, docs/test-perspectives, docs/design) start at-check-coverage.yml. What is left is a gap for a span naming a Markdown file under `packages/` or `scripts/`, renamed by a Markdown-only PR. It is reported on main by ci.yml's push run.",
    },
  },
  "pre-push no-nul-bytes": {
    ci: {
      commands: [
        "tsx scripts/lint/no-nul-bytes.ts",
        "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/lint/no-nul-bytes.ts",
      ],
      reason:
        "ci-skip.yml runs the same script with plain node so the docs-only stub needs no `pnpm install` (ADR-953).",
    },
  },
  "pre-push design-doc-refs": {
    ci: {
      commands: [
        "tsx scripts/lint/design-doc-refs.ts",
        "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/lint/design-doc-refs.ts",
      ],
      reason:
        "ci-skip.yml runs the same script with plain node so the docs-only stub needs no `pnpm install` (ADR-953).",
    },
  },
  "pre-push at-check-coverage": {},
  "pre-push krs-fences": { mirror: "scripts/lint/krs-fences.test.ts" },
  "pre-push app-shortcut-docs-sync": {
    mirror: "scripts/lint/app-shortcut-docs-sync.test.ts",
    uncovered: {
      globs: ["docs/tools/**"],
      reason:
        "A gap: docs/tools/** starts reference-docs-check.yml, which does not run this check, so a PR that drops a shortcut from docs/tools/app.md alone passes. It is reported on main by ci.yml's push run.",
    },
  },
  "pre-push e2e-command-coverage": {},
  "pre-push skill-cli-refs": {
    mirror: "scripts/lint/skill-cli-refs.test.ts",
    uncovered: {
      globs: [".claude/skills/**"],
      reason:
        "A gap: no PR workflow starts on `.claude/skills/**` (ci.yml ignores `.claude/**` and reference-docs-check.yml lists only `.claude/rules/**`). The two tracked entries are symlinks into `packages/skills/skills`, which is covered, so today the gap holds only a skill added directly under `.claude/skills`.",
    },
  },
  "pre-push skill-diagnostic-codes": { mirror: "scripts/lint/skill-diagnostic-codes.test.ts" },
  "pre-push diagnostic-ids-history": {},
  "pre-push skill-reference-bundle-sync": {},
  "pre-push builtin-icons-check": { mirror: "scripts/icons/gen-builtin-icons.test.ts" },
  "pre-push examples-generated-check": {
    mirror: "scripts/examples/gen-builtin-examples.test.ts",
    uncovered: {
      globs: ["examples/**/*.md"],
      reason:
        "The generator embeds `.krs` and `.krs.style` files; an example directory's README is not an input.",
    },
  },
  "pre-push reference-docs-check": {},
  "pre-push spec-structure-sync": {},
  "pre-push guide-diagrams-check": {},
  "pre-push docs-site-ci-paths-sync": {
    mirror: "scripts/lint/docs-site-ci-paths-sync.test.ts",
    uncovered: {
      globs: ["docs/**"],
      reason:
        "The hook globs all of docs/ because a new `.ja.md` beside a published page publishes it. The published pages and their siblings sit under reference-docs-check.yml's paths; a file elsewhere in docs/ is not published, so it cannot change the result.",
    },
  },
  "pre-push devcontainer-variants-sync": {
    mirror: "scripts/lint/devcontainer-variants-sync.test.ts",
  },
  "pre-push process-index": {},
  "pre-push roadmap-issue-state": {},
  "pre-push concept-adr-refs": {
    mirror: "scripts/lint/concept-adr-refs.test.ts",
    uncovered: {
      globs: ["docs/concepts*.md"],
      reason:
        "A gap: docs/concepts*.md starts reference-docs-check.yml, which does not run this check, so a PR that edits only a concept anchor passes. It is reported on main by ci.yml's push run.",
    },
  },
  "pre-push locale-normalization": {
    mirror: "scripts/lint/locale-normalization-single-owner.test.ts",
  },
  "pre-push reference-docs-links": { mirror: "scripts/lint/reference-docs-links.test.ts" },
};

/** The command `pnpm run test:scripts` comes down to: every `scripts/**` vitest file. */
const SCRIPTS_VITEST = "vitest run --config scripts/vitest.config.ts";

const ROOT_SCRIPTS = asMap(JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")))
  .scripts as unknown as Record<string, string>;

/**
 * The commands a shell command comes down to: root `package.json` scripts are
 * expanded (with their arguments appended, as pnpm does), `pnpm exec` is
 * dropped, and `&&` chains are split.
 */
function expand(command: string): string[] {
  return command.split(/\s+&&\s+/).flatMap((part) => {
    const words = part.trim().split(/\s+/);
    if (words[0] !== "pnpm") return [part.trim()];
    if (words[1] === "exec") return expand(words.slice(2).join(" "));
    const name = words[1] === "run" ? words[2] : words[1];
    const rest = words.slice(words[1] === "run" ? 3 : 2);
    const script = name === undefined ? undefined : ROOT_SCRIPTS[name];
    return script === undefined ? [part.trim()] : expand([script, ...rest].join(" "));
  });
}

interface Hook {
  readonly key: string;
  readonly run: string;
  readonly glob?: string;
}

const HOOKS: Hook[] = Object.entries(
  asMap(parseYaml(readFileSync(resolve(ROOT, "lefthook.yml"), "utf-8"))),
).flatMap(([hook, body]) =>
  Object.entries(asMap(asMap(body).commands)).map(([name, command]) => {
    const { run, glob } = asMap(command);
    return {
      key: `${hook} ${name}`,
      run: typeof run === "string" ? run : "",
      ...(typeof glob === "string" ? { glob } : {}),
    };
  }),
);

/** Each PR workflow with the commands its jobs' steps come down to. */
const PR_WORKFLOWS = workflowFiles()
  .map((name) => ({ name, workflow: readWorkflow(name) }))
  .filter(({ workflow }) => pullRequestFilter(workflow) !== undefined)
  .map(({ name, workflow }) => ({
    name,
    filter: pullRequestFilter(workflow)!,
    jobs: jobs(workflow).map((job) => ({
      if: job.if,
      steps: job.steps.map((step) => ({
        if: step.if,
        commands: new Set(step.commands.flatMap(expand)),
      })),
    })),
  }));

/**
 * `if:` conditions a counterpart job or step may carry, and why they leave the
 * check running on every PR that can merge. The reader does not evaluate
 * conditions, so any other one on a counterpart is reported rather than
 * assumed to let PRs through: a push-only step would otherwise count as PR
 * coverage.
 */
const REVIEWED_CONDITIONS: Record<string, string> = {
  "github.event.pull_request.draft != true":
    "Skips a draft PR, which cannot merge; the workflow runs again on ready_for_review.",
  "steps.mode.outputs.mode == 'diff'":
    "secret-scan.yml's mode step sets `diff` for pull_request and push events.",
};

/** The script a command runs, or its first two words when it names none. */
const subject = (command: string): string =>
  command.split(" ").find((word) => /^scripts\/.+\.(?:ts|mts|sh)$/.test(word)) ??
  command.split(" ").slice(0, 2).join(" ");

/** The commands `hook` comes down to. */
const hookCommands = (hook: Hook): string[] => shellCommands(hook.run).flatMap(expand);

/**
 * The PR workflows that run `hook`'s check, by the same command, a declared one
 * or its mirror, with the `if:` conditions on the jobs and steps that do.
 */
function ciSide(hook: Hook, parity: Parity) {
  const wanted = hookCommands(hook);
  return PR_WORKFLOWS.flatMap((workflow) => {
    const conditions: string[] = [];
    const matched = workflow.jobs.filter((job) => {
      const has = (command: string) => job.steps.some((step) => step.commands.has(command));
      const used =
        wanted.length > 0 && wanted.every(has)
          ? wanted
          : (parity.ci?.commands.filter(has) ?? []).length > 0
            ? parity.ci!.commands.filter(has)
            : parity.mirror !== undefined && has(SCRIPTS_VITEST)
              ? [SCRIPTS_VITEST]
              : [];
      if (used.length === 0) return false;
      if (job.if !== undefined) conditions.push(job.if);
      for (const step of job.steps) {
        if (step.if !== undefined && used.some((command) => step.commands.has(command))) {
          conditions.push(step.if);
        }
      }
      return true;
    });
    return matched.length > 0 ? [{ ...workflow, conditions }] : [];
  });
}

/** Relative imports of a TypeScript file, resolved to repo paths without extension. */
function importsOf(file: string): string[] {
  const text = readFileSync(resolve(ROOT, file), "utf-8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)].map((m) =>
    relative(ROOT, resolve(ROOT, dirname(file), m[1]!)).replace(/\.(?:js|ts|mjs|mts)$/, ""),
  );
}

/** What is wrong with `hook`'s CI counterpart, as messages; empty when nothing is. */
function counterpartProblems(hook: Hook, parity: Parity): string[] {
  // An empty `run` expands to nothing, and "every command is in CI" would hold
  // vacuously for it.
  if (hookCommands(hook).length === 0) return ["the hook has no run command"];
  const side = ciSide(hook, parity);
  if (parity.localOnly !== undefined) {
    return side.length > 0 ? [`local-only, yet ${side.map((w) => w.name).join(", ")} runs it`] : [];
  }
  const problems: string[] = [];
  // A declared command must run the same script (or the same tool subcommand)
  // as the hook, so the table cannot map a hook to an unrelated step.
  const subjects = hookCommands(hook).map(subject);
  for (const command of parity.ci?.commands ?? []) {
    if (!subjects.includes(subject(command))) problems.push(`unrelated CI command: ${command}`);
  }
  if (parity.mirror !== undefined) {
    if (
      !/^scripts\/.+\.test\.ts$/.test(parity.mirror) ||
      !existsSync(resolve(ROOT, parity.mirror))
    ) {
      problems.push(`mirror is not an existing scripts/ vitest file: ${parity.mirror}`);
    } else {
      // The mirror must import, or name, the script the hook runs; otherwise
      // the table could point a hook at any test.
      const scripts = subjects
        .filter((s) => s.startsWith("scripts/"))
        .map((s) => s.replace(/\.(?:ts|mts|sh)$/, ""));
      const text = readFileSync(resolve(ROOT, parity.mirror), "utf-8");
      const reached = scripts.some(
        (script) => importsOf(parity.mirror!).includes(script) || text.includes(`${script}.ts`),
      );
      if (!reached)
        problems.push(
          `mirror ${parity.mirror} neither imports nor runs ${scripts.join(", ") || hook.run}`,
        );
    }
  }
  for (const workflow of side) {
    for (const cond of workflow.conditions) {
      if (!(cond in REVIEWED_CONDITIONS))
        problems.push(`unreviewed if: ${cond} (${workflow.name})`);
    }
  }
  if (side.length === 0) problems.push("no PR workflow runs it");
  return problems;
}

/**
 * Tracked files the hook fires on that start no PR workflow running its check
 * and are not exempted, plus exemptions that no longer exempt anything.
 */
function coverageProblems(hook: Hook, parity: Parity): string[] {
  if (parity.localOnly !== undefined) return [];
  const side = ciSide(hook, parity);
  const glob = hook.glob === undefined ? undefined : globToRegExp(hook.glob);
  const missed = trackedFiles()
    .filter((file) => glob === undefined || glob.test(file))
    .filter((file) => !side.some((workflow) => startsOn(workflow.filter, file)));
  const allowed = (parity.uncovered?.globs ?? []).map((pattern) => ({
    pattern,
    regexp: globToRegExp(pattern),
  }));
  return [
    ...missed.filter((file) => !allowed.some(({ regexp }) => regexp.test(file))),
    // An exemption that no longer matches a missed file has outlived its reason.
    ...allowed
      .filter(({ regexp }) => !missed.some((file) => regexp.test(file)))
      .map(({ pattern }) => `stale exemption: ${pattern}`),
  ];
}

describe("lefthook ↔ CI parity (TPL-1480, TPL-2446)", () => {
  it("has an entry for every hook command, and no entry without one", () => {
    expect(HOOKS.length).toBeGreaterThan(20);
    expect(Object.keys(PARITY).sort()).toEqual(HOOKS.map((hook) => hook.key).sort());
  });

  it("expands root scripts the way pnpm runs them", () => {
    expect(expand("pnpm gen:icons --check")).toEqual([
      "tsx scripts/icons/gen-builtin-icons.ts --check",
    ]);
    expect(expand("pnpm run test:coverage")).toContain(SCRIPTS_VITEST);
  });

  describe.each(HOOKS)("$key", (hook) => {
    const parity = PARITY[hook.key] ?? {};

    it("runs in CI as the same command, a declared one, or a vitest mirror", () => {
      expect(counterpartProblems(hook, parity)).toEqual([]);
    });

    it("starts a CI run of the check on every tracked file the hook fires on", () => {
      expect(coverageProblems(hook, parity)).toEqual([]);
    });
  });
});
