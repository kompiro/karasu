import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "reminder.sh");
const work = mkdtempSync(join(tmpdir(), "pr-shots-hook-"));

afterAll(() => rmSync(work, { recursive: true, force: true }));

const PR_URL = "https://github.com/kompiro/karasu/pull/42\n";
/** The PR template's section, whose comment itself names the no-change line. */
const TEMPLATE_SECTION =
  "## Before / after\n\n<!--\nFrom `pnpm pr:shots`; when it finds no rendering change,\n" +
  'paste its "No rendering change" line.\n-->\n';
const body = (section: string) => `## Purpose\n\nCloses #1\n\n${section}\n## Related Docs\n\nN/A\n`;

let stubCount = 0;

/**
 * A fake gh that logs each argv. `pr diff` prints `files` (or fails when
 * null); `pr view` prints `prBody` as `--json body` does.
 */
function stubGh(
  files: string[] | null,
  prBody: string,
  diffRefused = false,
): { bin: string; argsFile: string } {
  stubCount += 1;
  const bin = join(work, `gh-${stubCount}`);
  const argsFile = join(work, `gh-${stubCount}.args`);
  const filesFile = join(work, `gh-${stubCount}.files`);
  const bodyFile = join(work, `gh-${stubCount}.body`);
  writeFileSync(filesFile, (files ?? []).join("\n"));
  writeFileSync(bodyFile, JSON.stringify({ body: prBody }));
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> '${argsFile}'`,
      `case "$1 $2" in`,
      `  "pr diff") ${files === null || diffRefused ? "exit 1" : `cat '${filesFile}'`} ;;`,
      `  "pr view") cat '${bodyFile}' ;;`,
      `  "api repos/kompiro/karasu/pulls/42/files") ${files === null ? "exit 1" : `cat '${filesFile}'`} ;;`,
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

type Event =
  | { hook_event_name: "PostToolUse"; tool_response: { stdout?: string; stderr?: string } }
  | { hook_event_name: "PostToolUseFailure"; error: string; is_interrupt?: boolean };

const created = (stdout = PR_URL): Event => ({
  hook_event_name: "PostToolUse",
  tool_response: { stdout, stderr: "" },
});

function runHook(command: string, event: Event, gh: { bin: string }): string {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: work, ...event });
  const result = spawnSync("bash", [HOOK], {
    input,
    encoding: "utf8",
    env: { ...process.env, PR_SHOTS_HOOK_GH: gh.bin },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function context(stdout: string, eventName = "PostToolUse"): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe(eventName);
  return parsed.hookSpecificOutput.additionalContext;
}

const ghCalls = (gh: { argsFile: string }) => readFileSync(gh.argsFile, "utf8").trim().split("\n");

const CREATE = "gh pr create --draft --label 'risk: high' --body-file /tmp/body.md";

describe("pr-shots reminder hook", () => {
  it("reminds when core rendering code changed and the section is still the template", () => {
    const gh = stubGh(["packages/core/src/renderer/svg-renderer.ts"], body(TEMPLATE_SECTION));
    const ctx = context(runHook(CREATE, created(), gh));
    expect(ctx).toContain("PR kompiro/karasu#42");
    expect(ctx).toContain("packages/core/src/renderer/svg-renderer.ts");
    expect(ctx).toContain("pnpm pr:shots");
    expect(ctx).toContain("gh pr edit 42 --repo kompiro/karasu");
  });

  it.each([
    ["an example", "examples/en/getting-started/index.krs"],
    ["app UI source", "packages/app/src/components/Toolbar.tsx"],
  ])("reminds when %s changed", (_, file) => {
    const gh = stubGh([file], body(TEMPLATE_SECTION));
    expect(context(runHook(CREATE, created(), gh))).toContain(file);
  });

  it("reminds when the section is missing altogether", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(""));
    expect(context(runHook(CREATE, created(), gh))).toContain("pnpm pr:shots");
  });

  it("still reminds when the only image is outside the section", () => {
    const prBody =
      "## Summary\n\n![diagram](https://github.com/user-attachments/assets/abc)\n\n" +
      TEMPLATE_SECTION;
    const gh = stubGh(["packages/core/src/layout/layout.ts"], prBody);
    expect(context(runHook(CREATE, created(), gh))).toContain("pnpm pr:shots");
  });

  it("reminds on PostToolUseFailure, when a later command in the call failed", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(TEMPLATE_SECTION));
    const event: Event = {
      hook_event_name: "PostToolUseFailure",
      error: `Exit code 1\n${PR_URL}`,
    };
    expect(context(runHook(`${CREATE} && false`, event, gh), "PostToolUseFailure")).toContain(
      "PR kompiro/karasu#42",
    );
  });

  it("falls back to the PR's file list when GitHub refuses the diff of a large PR", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(TEMPLATE_SECTION), true);
    expect(context(runHook(CREATE, created(), gh))).toContain("packages/core/src/layout/layout.ts");
    expect(ghCalls(gh)[1]).toBe(
      "api repos/kompiro/karasu/pulls/42/files --paginate --jq .[].filename",
    );
  });

  it("does not count an attached file that is not an image", () => {
    const section =
      "## Before / after\n\n[log.txt](https://github.com/user-attachments/files/1/log.txt)\n";
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(section));
    expect(context(runHook(CREATE, created(), gh))).toContain("pnpm pr:shots");
  });

  it.each([
    ["tests", ["packages/core/src/layout/layout.test.ts", "packages/app/src/__tests__/a.tsx"]],
    ["docs", ["docs/process.md", "scripts/pr-shots/shots.ts"]],
    ["another package", ["packages/cli/src/index.ts"]],
  ])("stays silent when the PR changes only %s", (_, files) => {
    const gh = stubGh(files, body(TEMPLATE_SECTION));
    expect(runHook(CREATE, created(), gh)).toBe("");
  });

  it("stays silent when the section carries an attached image", () => {
    const section =
      "## Before / after\n\n| Before | After |\n| --- | --- |\n" +
      "| ![b](https://github.com/user-attachments/assets/1) | ![a](https://github.com/user-attachments/assets/2) |\n";
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(section));
    expect(runHook(CREATE, created(), gh)).toBe("");
  });

  it("stays silent when pr:shots found no rendering change", () => {
    const section =
      "## Before / after\n\nNo rendering change (0 acceptance-test fences, 65 example files)\n";
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(section));
    expect(runHook(CREATE, created(), gh)).toBe("");
  });

  it("stays silent and never calls gh for commands without pr create", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(TEMPLATE_SECTION));
    expect(runHook("gh pr view 42 --json url", created(), gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the output carries no PR URL (a grep, a heredoc)", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(TEMPLATE_SECTION));
    const out = runHook(
      `grep -n "gh pr create" docs/process.md`,
      created("docs/process.md:132\n"),
      gh,
    );
    expect(out).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the user interrupted the call", () => {
    const gh = stubGh(["packages/core/src/layout/layout.ts"], body(TEMPLATE_SECTION));
    const event: Event = {
      hook_event_name: "PostToolUseFailure",
      error: `Exit code 130\n${PR_URL}`,
      is_interrupt: true,
    };
    expect(runHook(CREATE, event, gh)).toBe("");
  });

  it("stays silent when gh cannot read the diff", () => {
    const gh = stubGh(null, body(TEMPLATE_SECTION));
    expect(runHook(CREATE, created(), gh)).toBe("");
  });

  it("reads the PR from the URL, including its repository", () => {
    const gh = stubGh(["examples/en/hato/index.krs"], body(TEMPLATE_SECTION));
    const ctx = context(runHook(CREATE, created("https://github.com/someone/fork/pull/7\n"), gh));
    expect(ctx).toContain("PR someone/fork#7");
  });
});
