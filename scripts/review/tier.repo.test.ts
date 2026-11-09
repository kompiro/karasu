import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// `tier.ts classify --closes` against a real git repository (Issue #3542): the
// backing Design Doc read at the merge base, its history on main, and the
// `-U3` diff of each spec file, joined as the check joins them. The unit tests
// in tier.test.ts cover each piece; these replay #3320's spec diff through the
// whole path.

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURES = join(import.meta.dirname, "fixtures/spec-agreement-3320");
// A caller's GIT_DIR or GIT_INDEX_FILE (a pre-push hook sets them) must not
// point the throwaway repository's git at the real one.
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const ISSUE = 99991;
// Built, not written out: lint:design-doc-refs reads a literal path as a citation.
const DOC = ["docs", "design", "label-frames.md"].join("/");
const EN = "docs/spec/style.md";
const JA = "docs/spec/style.ja.md";

const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf-8");
/** A diff's hunk lines, from its first `@@` header: what a Design Doc's block holds. */
const hunkLines = (diff: string) =>
  diff
    .slice(diff.indexOf("\n@@") + 1)
    .replace(/\n$/, "")
    .split("\n");
const designDoc = (en = hunkLines(fixture("style.md.diff"))) =>
  [
    "# Labels stay inside frames",
    "",
    "- **関連**:",
    `  - 引き金 Issue: [#${ISSUE}](https://github.com/kompiro/karasu/issues/${ISSUE})`,
    "",
    "## 現時点の方針",
    "",
    "### 仕様の変更",
    "",
    `\`\`\`diff file=${EN}`,
    ...en,
    "```",
    "",
    `\`\`\`diff file=${JA}`,
    ...hunkLines(fixture("style.ja.md.diff")),
    "```",
    "",
  ].join("\n");

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, env: ENV, encoding: "utf-8" }).trim();
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (message: string) => {
  git("add", "-A");
  git("commit", "-q", "-m", message);
};
/** Points origin/main, which the backing rules read, at the current commit. */
const publish = () => git("update-ref", "refs/remotes/origin/main", "HEAD");
/** The branch that applies #3320's spec diff (and a code file) on top of main. */
const implement = () => {
  git("checkout", "-q", "-b", "impl");
  for (const name of ["style.md.diff", "style.ja.md.diff"]) {
    git("apply", join(FIXTURES, name));
  }
  write("packages/core/src/renderer/x.ts", "export const x = 1;\n");
  commit("impl");
};
const classify = () =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(ROOT, "scripts/review/tier.ts"),
        "classify",
        "--closes",
        String(ISSUE),
        "--author",
        "kompiro",
      ],
      { cwd: repo, env: ENV, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ),
  ) as { tier: string; reasons: string[]; designDoc: { state: string; reason?: string } };
const specTiers = (r: ReturnType<typeof classify>) =>
  r.reasons.filter((l) => l.startsWith("docs/spec/"));

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "tier-agreement-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  write(EN, fixture("style.md.base"));
  write(JA, fixture("style.ja.md.base"));
  commit("base");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("tier.ts classify --closes with #3320's spec diff (#3542)", () => {
  it("is Medium when a Design commit on main holds the spec text", () => {
    write(DOC, designDoc());
    commit("docs(design): agree the label text");
    publish();
    implement();
    const r = classify();
    expect(r.designDoc.state).toBe("backed");
    expect(specTiers(r)).toEqual([
      `${JA}: medium (the text the backing Design Doc agreed)`,
      `${EN}: medium (the text the backing Design Doc agreed)`,
    ]);
    expect(r.tier).toBe("medium");
  });

  it("is High, both files, when the Design Doc's block has one line reworded", () => {
    const en = hunkLines(fixture("style.md.diff")).map((l) =>
      l.replace("merely touching", "touching"),
    );
    write(DOC, designDoc(en));
    commit("docs(design): agree the label text");
    publish();
    implement();
    const r = classify();
    expect(specTiers(r)).toEqual([`${JA}: high`, `${EN}: high`]);
    expect(r.tier).toBe("high");
  });

  it("is High when the PR adds the Design Doc itself", () => {
    publish();
    implement();
    write(DOC, designDoc());
    commit("add the doc on the PR side");
    const r = classify();
    expect(r.designDoc.state).toBe("none");
    expect(r.tier).toBe("high");
  });

  it("is High when a Medium commit brought the blocks in, even after a later Design commit", () => {
    write(DOC, designDoc());
    write("packages/app/src/y.ts", "export const y = 1;\n");
    commit("feat: the doc with code");
    write(DOC, `${designDoc()}\nA later note.\n`);
    commit("docs(design): a later note");
    publish();
    implement();
    const r = classify();
    expect(r.designDoc.reason).toMatch(/in a medium change/);
    expect(r.tier).toBe("high");
  });

  it("is High when main revises the Design Doc after the merge base, until main is merged", () => {
    write(DOC, designDoc());
    commit("docs(design): agree the label text");
    publish();
    implement();
    git("checkout", "-q", "main");
    write(DOC, `${designDoc()}\nRevised.\n`);
    commit("docs(design): revise");
    publish();
    git("checkout", "-q", "impl");
    expect(classify().designDoc.reason).toMatch(/merge main/);
    expect(classify().tier).toBe("high");
    git("merge", "-q", "--no-edit", "main");
    expect(classify().tier).toBe("medium");
  });
});
