import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "name-from-prompt.sh");
const work = realpathSync(mkdtempSync(join(tmpdir(), "session-name-hook-")));

afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Runs the hook on a hook input and returns the session name it sets, or null for no output. */
function run(input: unknown): string | null {
  const r = spawnSync(HOOK, [], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  if (r.stdout.trim() === "") return null;
  const out = JSON.parse(r.stdout);
  expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  return out.hookSpecificOutput.sessionTitle;
}

let n = 0;
/** A transcript whose custom-title lines name the session in this order. */
function transcript(...names: string[]): string {
  const path = join(work, `t${n++}.jsonl`);
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    ...names.map((name) =>
      JSON.stringify({ type: "custom-title", customTitle: name, sessionId: "s" }),
    ),
    JSON.stringify({ type: "assistant", message: { content: "ok" } }),
  ];
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

describe("name-from-prompt hook (#3920)", () => {
  it("names a session after each start skill", () => {
    expect(run({ prompt: "/impl 3920" })).toBe("impl-3920");
    expect(run({ prompt: "/local-review 3920" })).toBe("review-3920");
    expect(run({ prompt: "/verify 3920" })).toBe("verify-3920");
  });

  it("accepts a # before the number and trims surrounding whitespace and newlines", () => {
    expect(run({ prompt: "/impl #3920" })).toBe("impl-3920");
    expect(run({ prompt: "  /verify 12\n" })).toBe("verify-12");
    expect(run({ prompt: "\n\t/local-review #7 \n\n" })).toBe("review-7");
  });

  it("drops the editor context the VS Code extension puts in front of the prompt", () => {
    // The form seen on 2.1.332 when a file is open in the editor (#3920 manual check M1).
    const opened =
      "<ide_opened_file>The user opened the file /w/reports/pr-verify/3939/summary.md in the IDE. " +
      "This may or may not be related to the current task.</ide_opened_file>\n";
    const selection =
      "<ide_selection>The user selected the lines 1 to 2 from /w/a.ts:\nconst a = 1;\n" +
      "</ide_selection>\n";
    expect(run({ prompt: `${opened}/impl 3920` })).toBe("impl-3920");
    expect(run({ prompt: `${selection}/verify #3920` })).toBe("verify-3920");
    expect(run({ prompt: `${opened}${selection}\n/local-review 3920\n` })).toBe("review-3920");
  });

  describe("sets no name when the editor context is not just in front", () => {
    const opened = "<ide_opened_file>x</ide_opened_file>\n";
    it.each([
      `${opened}/impl`,
      `${opened}/impl 3920 please`,
      `${opened}please\n/impl 3920`,
      `/impl 3920\n${opened}`,
      `<ide_opened_file>unclosed\n/impl 3920`,
      `<ide_diagnostics>x</ide_diagnostics>\n/impl 3920`,
    ])("%j", (prompt) => {
      expect(run({ prompt })).toBeNull();
    });
  });

  describe("sets no name for any other prompt", () => {
    it.each([
      "hello",
      "/review 3920", // the built-in /code-review alias, not a start skill
      "/impl 3920 please",
      "please /impl 3920",
      "/impl",
      "/impl abc",
      "/impl 3920\n/verify 3920",
      "/impl  3920",
      "/IMPL 3920",
      "/pr-verify 3920",
    ])("%j", (prompt) => {
      expect(run({ prompt })).toBeNull();
    });
  });

  it("does not move a session that carries another role's name", () => {
    const t = transcript("impl-3920");
    expect(run({ prompt: "/verify 3920", transcript_path: t })).toBeNull();
    expect(run({ prompt: "/local-review 3920", transcript_path: t })).toBeNull();
  });

  it("renames a session that has the same role, an automatic name or no name", () => {
    expect(run({ prompt: "/impl 3921", transcript_path: transcript("impl-3920") })).toBe(
      "impl-3921",
    );
    expect(run({ prompt: "/impl 3920", transcript_path: transcript("karasu-9b") })).toBe(
      "impl-3920",
    );
    expect(run({ prompt: "/impl 3920", transcript_path: transcript() })).toBe("impl-3920");
  });

  it("reads the last name in the transcript", () => {
    const renamed = transcript("verify-3920", "karasu-1f");
    expect(run({ prompt: "/impl 3920", transcript_path: renamed })).toBe("impl-3920");
    const named = transcript("karasu-1f", "verify-3920");
    expect(run({ prompt: "/impl 3920", transcript_path: named })).toBeNull();
  });

  it("reads only name records, not lines that merely contain the text", () => {
    const path = transcript("verify-3920");
    // A later tool call whose input is an object shaped like a name record must not pose as the name.
    writeFileSync(
      path,
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", input: { type: "custom-title", customTitle: "karasu-1f" } },
          ],
        },
      }) + "\n",
      { flag: "a" },
    );
    expect(run({ prompt: "/impl 3920", transcript_path: path })).toBeNull();
  });

  it("reads the current name from session_title before the transcript", () => {
    // session_title is in the hook input once the session has a name (seen on 2.1.332).
    expect(run({ prompt: "/verify 3920", session_title: "impl-3920" })).toBeNull();
    expect(run({ prompt: "/impl 3921", session_title: "impl-3920" })).toBe("impl-3921");
    expect(run({ prompt: "/impl 3920", session_title: "karasu-9b" })).toBe("impl-3920");
    // session_title is the current name, so it wins over the transcript's record.
    const t = transcript("verify-3920");
    expect(run({ prompt: "/impl 3920", session_title: "karasu-1f", transcript_path: t })).toBe(
      "impl-3920",
    );
    expect(run({ prompt: "/impl 3920", session_title: "verify-3920" })).toBeNull();
  });

  it("falls back to the transcript when session_title is empty or not a string", () => {
    const t = transcript("verify-3920");
    expect(run({ prompt: "/impl 3920", session_title: "", transcript_path: t })).toBeNull();
    expect(run({ prompt: "/impl 3920", session_title: 7, transcript_path: t })).toBeNull();
  });

  it("names the session when the transcript is missing", () => {
    expect(run({ prompt: "/impl 3920", transcript_path: join(work, "missing.jsonl") })).toBe(
      "impl-3920",
    );
  });

  it("exits 0 silently on input it cannot read", () => {
    expect(run("not json")).toBeNull();
    expect(run({})).toBeNull();
    expect(run({ prompt: 3920 })).toBeNull();
  });
});
