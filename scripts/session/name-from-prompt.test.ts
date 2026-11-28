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
