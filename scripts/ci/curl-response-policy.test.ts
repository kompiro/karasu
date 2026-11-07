import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A `curl` in a workflow exits 0 on an HTTP error unless told otherwise, so a
// rejected request looks like success (TPL-2291: the purge action "succeeded"
// against an API that was answering 400). Each call must either fail on the
// status, for a plain download, or keep the status and the body so that the
// step can check one and log the other. `.github/aw` is not scanned: it holds
// local agent logs, not anything CI runs.

const ROOT = resolve(import.meta.dirname, "../..");
const SCANNED_DIRS = [".github/workflows", ".github/actions"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

/** Each `curl` command with its `\` continuation lines joined, comments skipped. */
export function curlCommands(yaml: string): string[] {
  const lines = yaml.split("\n");
  const commands: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (/^\s*#/.test(line) || !/(^|[\s(|;&])curl\s/.test(line)) continue;
    let command = line;
    for (let next = i; lines[next]?.trimEnd().endsWith("\\"); next++) {
      command += ` ${lines[next + 1] ?? ""}`;
    }
    commands.push(command.trim());
  }
  return commands;
}

/** Why a command can hide a failed response, or `undefined` when it cannot. */
export function curlProblem(command: string, yaml: string): string | undefined {
  if (/\s-o\s+\/dev\/null\b/.test(command)) return "discards the response body";
  // `-f`, or `-f` inside a flag cluster such as `-sSfL`.
  if (/\s(?:-[a-zA-Z]*f[a-zA-Z]*|--fail(?:-with-body)?)(?=\s)/.test(command)) return undefined;
  const bodyFile = /\s-o\s+"?(\$[^\s"]+)"?/.exec(command)?.[1];
  if (!bodyFile || !command.includes("%{http_code}")) {
    return "neither fails on the status (-f) nor keeps the status and the body";
  }
  return yaml.includes(`cat "${bodyFile}"`) ? undefined : `never logs ${bodyFile}`;
}

describe("curl in workflows and actions (TPL-2291)", () => {
  const files = SCANNED_DIRS.flatMap((dir) => walk(resolve(ROOT, dir)));

  it("finds the calls it is meant to read", () => {
    // A parser that stopped matching would otherwise turn this into a silent pass.
    const count = files.flatMap((file) => curlCommands(readFileSync(file, "utf-8"))).length;
    expect(count).toBeGreaterThan(0);
  });

  it("checks the response of every call", () => {
    const problems = files.flatMap((file) => {
      const yaml = readFileSync(file, "utf-8");
      return curlCommands(yaml).flatMap((command) => {
        const problem = curlProblem(command, yaml);
        return problem ? [`${file.slice(ROOT.length + 1)}: ${problem}: ${command}`] : [];
      });
    });
    expect(problems).toEqual([]);
  });

  describe("what the rule reads", () => {
    const logged = 'cat "$body"';

    it.each([
      ["-f alone", "curl -f https://x"],
      ["-f in a cluster", 'curl -sSfL "https://x" | tar xz'],
      ["--fail", "curl --fail https://x"],
      ["--fail-with-body", "curl --fail-with-body https://x"],
      [
        "a kept status and a logged body",
        `status=$(curl -sS -o "$body" -w '%{http_code}' https://x)`,
      ],
    ])("accepts %s", (_name, command) => {
      expect(curlProblem(command, logged)).toBeUndefined();
    });

    it.each([
      ["a bare call", "curl https://x"],
      ["-sS, which only quietens it", "curl -sS https://x"],
      ["a discarded body", "curl -sS -o /dev/null -w '%{http_code}' https://x"],
      ["a -f with a discarded body", "curl -f -o /dev/null https://x"],
      ["a body with no status", 'curl -sS -o "$body" https://x'],
      ["an option whose value holds an f", "curl --max-time 5 --form a=b https://x"],
    ])("rejects %s", (_name, command) => {
      expect(curlProblem(command, logged)).toBeDefined();
    });

    it("rejects a kept body that is never logged", () => {
      const command = `status=$(curl -sS -o "$body" -w '%{http_code}' https://x)`;
      expect(curlProblem(command, "exit 1")).toBe("never logs $body");
    });

    it("joins continuation lines and skips comments", () => {
      const yaml = ["# curl https://nope", "run: |", "  curl -sS \\", "    https://x", "  echo ok"];
      expect(curlCommands(yaml.join("\n"))).toEqual(["curl -sS \\     https://x"]);
    });
  });
});
