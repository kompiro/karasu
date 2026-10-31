import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The `Validate` check and the freshness watcher against a real git repository
// and the real generator (Issue #3416). The unit tests in check-generated.test.ts
// cover the decisions; these cover what only real commits show: the merge base,
// `--no-renames`, reading the head commit rather than the checkout, and the
// generator running on a commit's inputs.

const ROOT = resolve(import.meta.dirname, "../..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const ADR = join(ROOT, "node_modules", ".bin", "adr");
// A caller's GIT_DIR or GIT_INDEX_FILE (a pre-push hook sets them) must not
// point the throwaway repository's git at the real one.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const HOUR = 3600;

const CONFIG = (graphByTopic = "graph/") =>
  JSON.stringify({
    idFormat: "issue-number",
    topics: ["build"],
    concerns: ["ci"],
    paths: {
      adrDir: "docs/adr",
      outputs: { effective: "effective.md", graph: "graph.md", graphByTopic },
    },
  });

const adrText = (n: number) =>
  [
    "---",
    `id: ADR-${n}`,
    `title: sample ${n}`,
    "status: accepted",
    "date: 2026-10-31",
    "topic: build",
    "---",
    "",
    `# ADR-${n}: sample ${n}`,
    "",
  ].join("\n");

let repo: string;

const git = (args: string[], env: Record<string, string> = {}) =>
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: { ...ENV, ...env },
  }).trim();

const write = (path: string, text: string) => {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), text);
};

/** Commits everything, optionally `hoursAgo` in committer time, and returns the SHA. */
const commit = (message: string, hoursAgo = 0) => {
  git(["add", "-A"]);
  const when = `${Math.floor(Date.now() / 1000) - hoursAgo * HOUR} +0000`;
  git(["commit", "-q", "--allow-empty", "-m", message], {
    GIT_COMMITTER_DATE: when,
    GIT_AUTHOR_DATE: when,
  });
  return git(["rev-parse", "HEAD"]);
};

const regenerate = () =>
  execFileSync(ADR, ["regenerate"], { cwd: repo, env: ENV, stdio: ["ignore", "ignore", "pipe"] });

const run = (script: string, args: string[]) => {
  try {
    const out = execFileSync(TSX, [join(ROOT, "scripts/adr", script), ...args], {
      cwd: repo,
      encoding: "utf-8",
      env: ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
};
const check = (base: string, head: string) =>
  run("check-generated.ts", ["--base", base, "--head", head]);
const freshness = () => run("check-freshness.ts", []);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "adr-validate-"));
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "test"]);
  git(["config", "user.email", "test@example.com"]);
  // The freshness watcher reads the generator version from the lockfile.
  write("pnpm-lock.yaml", "packages:\n\n  '@kompiro/adr-tools@0.0.13':\n");
  write("adr.config.json", CONFIG());
  write("docs/adr/1-sample.md", adrText(1));
  regenerate();
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-generated.ts on a real repository", { timeout: 60_000 }, () => {
  let base: string;
  beforeEach(() => {
    base = commit("main with a current index", 100);
  });

  /** A branch from `base` that adds ADR `n` without regenerating. */
  const adrBranch = (n: number) => {
    git(["checkout", "-q", "-B", `adr-${n}`, base]);
    write(`docs/adr/${n}-sample.md`, adrText(n));
    return commit(`add ADR-${n}`);
  };

  it("passes an ADR PR that leaves the generated files alone", () => {
    expect(check(base, adrBranch(2))).toMatchObject({ code: 0 });
  });

  it("passes a regeneration PR that holds exactly the generator's output", () => {
    const merged = adrBranch(2);
    regenerate();
    expect(check(merged, commit("regenerate")).code).toBe(0);
  });

  it("judges a regeneration PR at its head after main has moved on", () => {
    const merged = adrBranch(2);
    regenerate();
    const head = commit("regenerate");
    git(["checkout", "-q", "-B", "main-later", merged]);
    write("docs/adr/3-sample.md", adrText(3));
    const mainLater = commit("add ADR-3 after the regeneration PR was made");
    expect(check(mainLater, head).code).toBe(0);
  });

  it("fails a PR that adds an ADR and regenerates in the same change", () => {
    adrBranch(2);
    regenerate();
    const result = check(base, commit("ADR and index together"));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/drop them from this PR/);
  });

  it("fails a regeneration PR with a hand edit, an extra file or a deleted file", () => {
    const merged = adrBranch(2);
    regenerate();
    const regenerated = commit("regenerate");
    const variants: [string, () => void, RegExp][] = [
      ["hand edit", () => write("docs/adr/effective.md", "edited\n"), /differs/],
      ["extra file", () => write("docs/adr/graph/extra.md", "x\n"), /not written by the generator/],
      ["deleted file", () => rmSync(join(repo, "docs/adr/graph/build.md")), /missing/],
    ];
    for (const [name, change, message] of variants) {
      git(["checkout", "-q", "-B", name.replace(" ", "-"), regenerated]);
      change();
      const result = check(merged, commit(name));
      expect({ name, code: result.code }).toEqual({ name, code: 1 });
      expect(`${name}: ${result.out}`).toMatch(message);
    }
  });

  it("fails an ADR moved under the generated directory", () => {
    git(["checkout", "-q", "-B", "move", base]);
    git(["mv", "docs/adr/1-sample.md", "docs/adr/graph/1-sample.md"]);
    expect(check(base, commit("move")).code).toBe(1);
  });

  it("passes an outputs change that only deletes the old output, then its regeneration", () => {
    git(["checkout", "-q", "-B", "outputs", base]);
    write("adr.config.json", CONFIG("topics/"));
    rmSync(join(repo, "docs/adr/graph"), { recursive: true });
    const moved = commit("move the per-topic output");
    expect(check(base, moved).code).toBe(0);
    regenerate();
    expect(check(moved, commit("regenerate into topics/")).code).toBe(0);
  });
});

describe("check-freshness.ts on a real repository", { timeout: 60_000 }, () => {
  it("passes when main's index is current", () => {
    commit("current index", 100);
    expect(freshness().code).toBe(0);
  });

  it("passes while an unreflected ADR is younger than 50 hours", () => {
    commit("current index", 100);
    write("docs/adr/2-sample.md", adrText(2));
    commit("ADR merged 10 hours ago", 10);
    expect(freshness().code).toBe(0);
  });

  it("fails once an unreflected ADR is older than 50 hours", () => {
    commit("current index", 100);
    write("docs/adr/2-sample.md", adrText(2));
    commit("ADR merged 60 hours ago", 60);
    write("docs/guide.md", "unrelated\n");
    commit("an unrelated change since", 1);
    const result = freshness();
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/last 50 hours/);
  });

  it("passes again after the regeneration merges", () => {
    commit("current index", 100);
    write("docs/adr/2-sample.md", adrText(2));
    commit("ADR merged 60 hours ago", 60);
    regenerate();
    commit("regeneration merged", 1);
    expect(freshness().code).toBe(0);
  });
});
