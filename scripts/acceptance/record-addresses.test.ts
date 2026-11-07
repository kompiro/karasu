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
    ["-F", "pnpm -F @karasu-tools/app dev", "dev-server-command"],
    ["--filter=", "pnpm --filter=@karasu-tools/app dev", "dev-server-command"],
    ["-C", "pnpm -C packages/app dev", "dev-server-command"],
    ["-r", "pnpm -r dev", "dev-server-command"],
    ["npm -w", "npm -w packages/app run dev", "dev-server-command"],
    ["yarn", "yarn dev", "dev-server-command"],
    ["pnpm preview", "pnpm --filter @karasu-tools/app preview", "dev-server-command"],
    ["run preview", "pnpm --filter @karasu-tools/docs-site run preview", "dev-server-command"],
    ["npm start", "npm start", "dev-server-command"],
    ["pnpm exec vite", "pnpm exec vite", "dev-server-command"],
    ["a filtered exec", "pnpm --filter @x/app exec vite --port 5173", "dev-server-command"],
    ["flags after run", "pnpm run --filter @x/app dev", "dev-server-command"],
    ["npm run with a workspace", "npm run --workspace=packages/app dev", "dev-server-command"],
    ["yarn vite", "yarn vite", "dev-server-command"],
    ["npx vite", "npx vite --port 5173", "dev-server-command"],
    ["vite dev", "vite dev", "dev-server-command"],
    ["astro dev", "`astro dev` で開く", "dev-server-command"],
    ["the dev server's address", "http://localhost:5173/", "dev-server-command"],
    ["a relative worktree path", "../.worktrees/x/a", "session-path"],
    ["a home worktree path", "~/.claude/worktrees/x/a", "session-path"],
    ["an absolute worktree path", "/workspaces/karasu/.claude/worktrees/feat/x/a", "session-path"],
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
    ["a test run", "pnpm vitest run src/a.test.ts"],
    ["vite preview as a subject", "`vite preview` を相手にする e2e には現れない"],
    ["a build", "pnpm --filter @karasu-tools/docs-site run build"],
    ["npx vitest", "npx vitest run"],
    ["vite build", "pnpm exec vite build"],
    ["a placeholder worktree", "`.claude/worktrees/<branch-name>`"],
    ["the worktree directory", "`.claude/worktrees/` 配下に置く"],
    ["a kept AT's serve port", "http://localhost:3000"],
  ])("leaves %s alone", (_name, source) => {
    expect(kinds(source)).toEqual([]);
  });

  it("does not backtrack on a long run of flags", () => {
    const started = performance.now();
    expect(kinds(`pnpm ${"--flag ".repeat(60)}build`)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("reports a markdown link's repeated host once", () => {
    const link = "[a.karasu.pages.dev](https://a.karasu.pages.dev)";
    expect(kinds(link)).toEqual(["preview-host"]);
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
