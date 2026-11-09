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
// there is nothing published to keep. No `karasu@*` tag at all fails, because a
// shallow checkout without tags would otherwise pass without comparing.
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

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** The newest `karasu@*` tag in version order, or undefined when there is none. */
function latestReleaseTag(cwd: string): string | undefined {
  const tags = git(["tag", "--list", "karasu@*", "--sort=-v:refname"], cwd)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags[0];
}

/** The registry's text at `rev`, or undefined when that tree has no registry. */
function registryAt(rev: string, cwd: string): string | undefined {
  try {
    return git(["show", `${rev}:${REGISTRY_PATH}`], cwd);
  } catch {
    return undefined;
  }
}

function main(): void {
  const cwd = process.cwd();
  const tag = latestReleaseTag(cwd);
  if (!tag) {
    console.error(
      "diagnostic-ids-history: no karasu@* tag found. Fetch the release tags " +
        "(git fetch origin 'refs/tags/karasu@*:refs/tags/karasu@*') and run again.",
    );
    process.exit(1);
  }
  const publishedText = registryAt(tag, cwd);
  if (publishedText === undefined) {
    console.log(`diagnostic-ids-history: ok (${tag} has no ID registry yet; nothing published)`);
    return;
  }
  const head = parseRegistry(readFileSync(join(cwd, REGISTRY_PATH), "utf8"));
  const problems = compareRegistries(parseRegistry(publishedText), head);
  if (problems.length > 0) {
    console.error(
      `diagnostic-ids-history: ${problems.length} published ID(s) changed since ${tag}:`,
    );
    for (const p of problems) {
      console.error(
        p.head === undefined
          ? `✗ ${p.id} named \`${p.published}\` in ${tag} and is gone at HEAD`
          : `✗ ${p.id} named \`${p.published}\` in ${tag} and names \`${p.head}\` at HEAD`,
      );
    }
    console.error(
      "\nA published ID keeps its code. Give the new code the next number, and " +
        `move a retired code's ID to RETIRED_DIAGNOSTIC_IDS in ${REGISTRY_PATH}.`,
    );
    process.exit(1);
  }
  console.log(`diagnostic-ids-history: ok (every ID in ${tag} names the same code at HEAD)`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /diagnostic-ids-history\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
