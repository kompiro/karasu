/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fails when an ID that a published release printed now names another code
// (Issue #3654, TPL-3654).
//
// The registry's own test checks one revision: one code per ID, numbers from
// 001 without a gap. That cannot see an ID moved from a retired code to a new
// one, because the numbers stay contiguous. This guard compares the registry
// against the latest released `karasu@*` tag: every ID there must still name
// the same code at HEAD, live or retired.
//
// It compares against the release rather than the merge base on purpose. Two
// parallel PRs can take the same number; both pass, and main's uniqueness test
// fails once both land. The fix is to renumber the later one in the next PR.
// That ID was never published, so renumbering it is not reuse, and comparing
// against the merge base would wrongly forbid it.
//
// A tag whose tree has no registry yet (the releases before #3654) passes:
// there is nothing published to keep. Every other way of not comparing fails:
// no `karasu@*` tag (a shallow checkout without tags), a git error reading the
// tag, or a published registry that parses to no entries.
//
// WHERE IT RUNS: lefthook pre-push, and `ci.yml`'s Check, which fetches the
// release tags first.

export const REGISTRY_PATH = "packages/core/src/types/diagnostic-ids.ts";

export interface Registry {
  /** code → ID for the codes in use. */
  active: Map<string, string>;
  /** ID → code for the retired codes. */
  retired: Map<string, string>;
}

/** Read the registry from its source text (one entry per line, by contract). */
export function parseRegistry(text: string): Registry {
  const active = new Map<string, string>();
  for (const m of text.matchAll(/^\s*"([a-z][a-z0-9-]+)":\s*"(KRS[0-9]{3})",?\s*$/gm)) {
    active.set(m[1], m[2]);
  }
  const retired = new Map<string, string>();
  for (const m of text.matchAll(
    /\{\s*id:\s*"(KRS[0-9]{3})",\s*code:\s*"([a-z][a-z0-9-]+)"\s*\}/g,
  )) {
    retired.set(m[1], m[2]);
  }
  return { active, retired };
}

/** ID → code over both the active and the retired entries. */
function codeById(registry: Registry): Map<string, string> {
  const byId = new Map<string, string>(registry.retired);
  for (const [code, id] of registry.active) byId.set(id, code);
  return byId;
}

export interface Problem {
  id: string;
  published: string;
  /** The code the ID names at HEAD, or undefined when HEAD lost the ID. */
  head: string | undefined;
}

/** Every published ID whose code differs at HEAD, or that HEAD no longer has. */
export function compareRegistries(published: Registry, head: Registry): Problem[] {
  const headById = codeById(head);
  const problems: Problem[] = [];
  for (const [id, code] of codeById(published)) {
    const now = headById.get(id);
    if (now !== code) problems.push({ id, published: code, head: now });
  }
  return problems.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Run git in `cwd`. GIT_DIR and friends are dropped so a caller's hook
 * environment cannot point the command at another repository.
 */
function git(args: string[], cwd: string): string {
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  return execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The newest `karasu@*` tag in version order, or undefined when there is none. */
function latestReleaseTag(cwd: string): string | undefined {
  const tags = git(["tag", "--list", "karasu@*", "--sort=-v:refname"], cwd)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags[0];
}

/** What marks the registry's file, wherever it lives in a release's tree. */
const REGISTRY_MARKER = "export const DIAGNOSTIC_IDS";

/**
 * The registry's text in `rev`, found by its declaration rather than by
 * {@link REGISTRY_PATH}, so moving the file cannot make a release that has one
 * look like a release without one. Undefined only when no file under
 * packages/core/src declares it; any other git failure throws.
 */
function registryAt(rev: string, cwd: string): string | undefined {
  let found: string;
  try {
    found = git(
      ["grep", "-l", "--fixed-strings", REGISTRY_MARKER, rev, "--", "packages/core/src"],
      cwd,
    );
  } catch (e) {
    // `git grep` exits 1 when nothing matches, and higher on a real failure.
    if ((e as { status?: number }).status === 1) return undefined;
    throw e;
  }
  const files = found
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/\.test\.ts$/.test(l));
  if (files.length !== 1) {
    throw new Error(`expected one registry in ${rev}, found: ${files.join(", ") || "none"}`);
  }
  // `git grep -l <rev>` prints `<rev>:<path>`.
  return git(["show", files[0]], cwd);
}

export interface Verdict {
  ok: boolean;
  message: string;
}

/** The guard's decision for the repository at `cwd`. */
export function verdict(cwd: string): Verdict {
  const tag = latestReleaseTag(cwd);
  if (!tag) {
    return {
      ok: false,
      message:
        "no karasu@* tag found. Fetch the release tags " +
        "(git fetch origin 'refs/tags/karasu@*:refs/tags/karasu@*') and run again.",
    };
  }
  const publishedText = registryAt(tag, cwd);
  if (publishedText === undefined) {
    return { ok: true, message: `ok (${tag} has no ID registry yet; nothing published)` };
  }
  const published = parseRegistry(publishedText);
  if (published.active.size === 0) {
    // A registry that parses to nothing would compare as "no change" and hide
    // every reuse. The parser and the file's shape have drifted apart.
    return {
      ok: false,
      message: `${tag}'s registry parsed to no entries; fix parseRegistry for that release's file shape.`,
    };
  }
  const head = parseRegistry(readFileSync(join(cwd, REGISTRY_PATH), "utf8"));
  const problems = compareRegistries(published, head);
  if (problems.length > 0) {
    const lines = problems.map((p) =>
      p.head === undefined
        ? `✗ ${p.id} named \`${p.published}\` in ${tag} and is gone at HEAD`
        : `✗ ${p.id} named \`${p.published}\` in ${tag} and names \`${p.head}\` at HEAD`,
    );
    return {
      ok: false,
      message: [
        `${problems.length} published ID(s) changed since ${tag}:`,
        ...lines,
        "",
        "A published ID keeps its code. Give the new code the next number, and " +
          `move a retired code's ID to RETIRED_DIAGNOSTIC_IDS in ${REGISTRY_PATH}.`,
      ].join("\n"),
    };
  }
  return { ok: true, message: `ok (every ID in ${tag} names the same code at HEAD)` };
}

function main(): void {
  const { ok, message } = verdict(process.cwd());
  if (!ok) {
    console.error(`diagnostic-ids-history: ${message}`);
    process.exit(1);
  }
  console.log(`diagnostic-ids-history: ${message}`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /diagnostic-ids-history\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
