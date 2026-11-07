import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRecordAddresses, findRecordAddresses } from "./record-addresses.ts";

const kinds = (source: string) => findRecordAddresses("x.md", source).map((f) => f.kind);

describe("findRecordAddresses (TPL-2254)", () => {
  it.each([
    ["a branch preview", "`feat-permalink.karasu.pages.dev` で確認済み", "preview-host"],
    ["a hash preview", "https://d5b2bda2.karasu.pages.dev/r/foo", "preview-host"],
    ["a docs preview", "https://fix-x.karasu-docs.pages.dev/karasu/", "preview-host"],
    ["a worktree path", "cd .worktrees/cli-render", "session-path"],
    ["a claude worktree path", "`.claude/worktrees/feat/x/index.krs`", "session-path"],
    ["npm run dev", "- App running (`npm run dev`)", "dev-server-command"],
    ["pnpm dev", "1. `pnpm dev` で起動", "dev-server-command"],
    ["pnpm run dev", "pnpm run dev", "dev-server-command"],
    ["a filtered dev", "`pnpm --filter @karasu-tools/app dev` →", "dev-server-command"],
  ])("flags %s", (_name, source, kind) => {
    expect(kinds(source)).toEqual([kind]);
  });

  it.each([
    ["the production host", "https://karasu.pages.dev/"],
    ["a placeholder host", "`<branch>.karasu.pages.dev`"],
    ["an elided host", "`…pages.dev/karasu/`"],
    ["another site's host", "https://foo.other.pages.dev"],
    ["a mention of the directory", "places the checkout under .claude/worktrees of the main one"],
    ["wrangler, which is the subject of a record", "`wrangler pages dev` は無視する"],
    ["karasu serve", "`karasu serve` を起動し http://localhost:3000 を開く"],
    ["a build command", "pnpm --filter @karasu-tools/app build"],
    ["a word starting with dev", "pnpm devtools"],
  ])("leaves %s alone", (_name, source) => {
    expect(kinds(source)).toEqual([]);
  });

  it("reports the line and the text as written", () => {
    expect(findRecordAddresses("x.md", "one\n> at `abc.karasu.pages.dev` で\n")).toEqual([
      { file: "x.md", line: 2, kind: "preview-host", text: "abc.karasu.pages.dev" },
    ]);
    expect(findRecordAddresses("x.md", "cd .worktrees/cli-render")[0]?.text).toBe(
      ".worktrees/cli-render",
    );
  });
});

describe("analyzeRecordAddresses", () => {
  it("finds nothing in this repo's records", () => {
    expect(analyzeRecordAddresses(resolve(import.meta.dirname, "../.."))).toEqual([]);
  });

  it("reports nothing for a repo without records", () => {
    expect(analyzeRecordAddresses("/nonexistent")).toEqual([]);
  });
});
