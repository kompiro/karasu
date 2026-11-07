import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A `curl` in a workflow exits 0 on an HTTP error unless told otherwise, so a
// rejected request looks like success (TPL-2291: the purge action "succeeded"
// against an API that was answering 400). Each call must either fail on the
// status, for a plain download, or keep the status and the body so that the step
// can compare one and log the other. Only curl in `.github` is read, while the
// TPL's items cover any external call, so this is a related test, not a guard
// marker on them (ADR-3038 D4).

const ROOT = resolve(import.meta.dirname, "../..");
const SCANNED_DIRS = [".github/workflows", ".github/actions"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

interface CurlCall {
  /** The words of the command, from `curl` to the end of its shell command. */
  words: string[];
  /** The variable capturing its output, as in `status=$(curl ...)`. */
  capturedBy: string | undefined;
  /** What follows on the same line, after the command ends. */
  after: string;
  /** The lines up to the next `curl`, where its result gets read. */
  following: string;
}

/** Splits a command into words, stopping at the first unquoted shell separator. */
function readCommand(text: string): { words: string[]; end: number } {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let i = 0;
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = undefined;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "|" || ch === ";" || ch === "&" || ch === ")" || ch === "\n") {
      break;
    } else if (/\s/.test(ch)) {
      if (word) words.push(word);
      word = "";
    } else {
      word += ch;
    }
  }
  if (word) words.push(word);
  return { words, end: i };
}

/** `line` up to an unquoted `#` that starts a word, which is what makes it a comment. */
function withoutComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Each `curl` command in a workflow, with `\` continuations joined and comments skipped. */
function curlCalls(yaml: string): CurlCall[] {
  const text = yaml.split("\n").map(withoutComment).join("\n").replace(/\\\n/g, " ");
  const starts = [...text.matchAll(/(?<![\w-])curl\s/g)].map((match) => match.index);
  return starts.map((start, i) => {
    const { words, end } = readCommand(text.slice(start));
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const stop = start + end;
    const lineEnd = text.indexOf("\n", stop);
    return {
      words,
      capturedBy: /(\w+)="?\$\($/.exec(text.slice(lineStart, start))?.[1],
      after: text.slice(stop, lineEnd === -1 ? text.length : lineEnd),
      following: text.slice(stop, starts[i + 1] ?? text.length),
    };
  });
}

/** Short options that take a value, which ends the cluster they appear in. */
const TAKES_VALUE = new Set("AbcCdDeEFhHKmoPQrtTuUwxXyYz");

interface CurlFlags {
  fail: boolean;
  failWithBody: boolean;
  output: string | undefined;
  writeOut: string | undefined;
}

function readFlags(words: readonly string[]): CurlFlags {
  const flags: CurlFlags = {
    fail: false,
    failWithBody: false,
    output: undefined,
    writeOut: undefined,
  };
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--fail") flags.fail = true;
    else if (word === "--fail-with-body") flags.failWithBody = true;
    else if (word === "--output") flags.output = words[++i];
    else if (word === "--write-out") flags.writeOut = words[++i];
    else if (/^-[A-Za-z]/.test(word)) {
      for (let c = 1; c < word.length; c++) {
        const letter = word[c]!;
        if (letter === "f") flags.fail = true;
        if (!TAKES_VALUE.has(letter)) continue;
        const value = word.slice(c + 1) || words[++i];
        if (letter === "o") flags.output = value;
        if (letter === "w") flags.writeOut = value;
        break;
      }
    }
  }
  return flags;
}

/** Why a call can hide a failed response, or `undefined` when it cannot. */
function curlProblem(call: CurlCall): string | undefined {
  const flags = readFlags(call.words);
  if (flags.output === "/dev/null") return "discards the response body";
  if (/\|\|/.test(call.after)) return "handles the failure itself, which can hide it";
  if (flags.failWithBody && call.capturedBy) return "captures the only copy of the body";
  if (flags.fail || flags.failWithBody) return undefined;
  if (!flags.output?.startsWith("$") || !flags.writeOut?.includes("%{http_code}")) {
    return "neither fails on the status (-f) nor keeps the status and the body";
  }
  if (!call.capturedBy || !call.following.includes(`$${call.capturedBy}`)) {
    return "never reads the status it kept";
  }
  return call.following.includes(`cat "${flags.output}"`)
    ? undefined
    : `never logs ${flags.output}`;
}

describe("curl in workflows and actions (TPL-2291)", () => {
  const files = SCANNED_DIRS.flatMap((dir) => walk(resolve(ROOT, dir)));

  it("finds the calls it is meant to read", () => {
    // A parser that stopped matching would otherwise turn this into a silent pass.
    const count = files.flatMap((file) => curlCalls(readFileSync(file, "utf-8"))).length;
    expect(count).toBeGreaterThan(0);
  });

  it("checks the response of every call", () => {
    const problems = files.flatMap((file) =>
      curlCalls(readFileSync(file, "utf-8")).flatMap((call) => {
        const problem = curlProblem(call);
        return problem
          ? [`${file.slice(ROOT.length + 1)}: ${problem}: ${call.words.join(" ")}`]
          : [];
      }),
    );
    expect(problems).toEqual([]);
  });

  describe("what the rule reads", () => {
    const problemOf = (script: string) => curlProblem(curlCalls(script)[0]!);
    const kept = `status=$(curl -sS -o "$body" -w '%{http_code}' https://x)`;
    const checked = `${kept}\nif [ "$status" != "200" ]; then\n  cat "$body"\n  exit 1\nfi`;

    it.each([
      ["-f alone", "curl -f https://x"],
      ["-f in a cluster", 'curl -sSfL "https://x" | tar xz'],
      ["--fail", "curl --fail https://x"],
      ["--fail-with-body", "curl --fail-with-body -o out https://x"],
      ["a kept status and a logged body", checked],
      ["a continuation line", `curl -sS \\\n  -f https://x`],
      ["-f after the URL", "curl https://x -f "],
    ])("accepts %s", (_name, script) => {
      expect(problemOf(script)).toBeUndefined();
    });

    it.each([
      ["a bare call", "curl https://x"],
      ["-sS, which only quietens it", "curl -sS https://x"],
      ["a discarded body", "curl -sS -o /dev/null -w '%{http_code}' https://x"],
      ["a -f with a discarded body", "curl -f -o /dev/null https://x"],
      ["a discarded body in a cluster", "curl -sSfo /dev/null https://x"],
      ["a discarded body, long form", "curl -f --output /dev/null https://x"],
      ["a body with no status", 'curl -sS -o "$body" https://x'],
      ["an option whose value holds an f", "curl --max-time 5 --form a=b https://x"],
      ["a value letter before the f", "curl -sXf https://x"],
      ["tar's -f after a pipe", "curl -sSL https://x | tar -xzf -"],
      ["rm's -f after &&", "curl -sS https://x > a && rm -f b"],
      ["rm's -f before it", "rm -f a; curl -sS https://x"],
      ["a swallowed failure", "curl -f https://x || true"],
      ["a failure turned into success", "curl -f https://x || exit 0"],
      ["the body captured, quoted", 'body="$(curl --fail-with-body https://x)"'],
      ["the body captured as the only copy", "body=$(curl --fail-with-body https://x)"],
      ["a status it never reads", `${kept}\ncat "$body"`],
      ["a body it never logs", `${kept}\nif [ "$status" != "200" ]; then exit 1; fi`],
    ])("rejects %s", (_name, script) => {
      expect(problemOf(script)).toBeDefined();
    });

    it("checks each call on its own, not the file as a whole", () => {
      const second = kept.replace("https://x", "https://y");
      const calls = curlCalls(`${second}\n${checked}`);
      expect(calls.map(curlProblem)).toEqual(["never reads the status it kept", undefined]);
    });

    it("does not read a trailing comment as part of the command", () => {
      expect(problemOf("curl -sS https://x # TODO add -f")).toBeDefined();
      expect(problemOf("curl -f https://x # falls back with || true")).toBeUndefined();
      expect(curlCalls("run: echo hi # curl https://nope")).toEqual([]);
    });

    it("keeps a # inside a word or a quoted value", () => {
      expect(curlCalls("curl -f https://x/#frag")[0]!.words).toContain("https://x/#frag");
      expect(curlCalls('curl -f "https://x/ #frag"')[0]!.words).toContain("https://x/ #frag");
    });

    it("skips comments and finds a call however it is reached", () => {
      expect(curlCalls("# curl https://nope")).toEqual([]);
      expect(curlCalls("run: /usr/bin/curl -f https://x")).toHaveLength(1);
      expect(curlCalls('run: bash -c "curl -f https://x"')).toHaveLength(1);
    });
  });
});
