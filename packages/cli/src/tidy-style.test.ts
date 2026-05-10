import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-tidy-style-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeStyle(name: string, content: string): Promise<string> {
  const p = join(tmpDir, name);
  await writeFile(p, content, "utf8");
  return p;
}

function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation((_code) => {
    throw new Error(`process.exit(${_code})`);
  });
}

function captureStdout(): string[] {
  const calls: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((data) => {
    calls.push(String(data));
    return true;
  });
  return calls;
}

function captureStderr(): string[] {
  const calls: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((data) => {
    calls.push(String(data));
    return true;
  });
  return calls;
}

import { tidyStyle } from "./tidy-style.js";

describe("tidyStyle() with explicit files", () => {
  it("rewrites a non-tidy file in place", async () => {
    const file = await writeStyle("site.krs.style", `service { shape: user; color: red; }\n`);
    const stdout = captureStdout();
    await tidyStyle([file], {});

    const after = readFileSync(file, "utf8");
    expect(after).toContain("color: red");
    // After axis reorder, color (visual) precedes shape (karasu).
    const colorIdx = after.indexOf("color:");
    const shapeIdx = after.indexOf("shape:");
    expect(colorIdx).toBeGreaterThan(-1);
    expect(shapeIdx).toBeGreaterThan(colorIdx);
    expect(stdout.join("")).toContain("tidied");
  });

  it("leaves an already-tidy file untouched and prints nothing", async () => {
    const file = await writeStyle("tidy.krs.style", `service {\n  color: red;\n}\n`);
    const before = readFileSync(file, "utf8");
    const stdout = captureStdout();
    await tidyStyle([file], {});

    expect(readFileSync(file, "utf8")).toBe(before);
    expect(stdout.join("")).toBe("");
  });

  it("merges duplicate rules by default", async () => {
    const file = await writeStyle(
      "dup.krs.style",
      `edge#A->B { direction: down; }\nedge#A->B { direction: up; }\n`,
    );
    const stdout = captureStdout();
    await tidyStyle([file], {});

    const after = readFileSync(file, "utf8");
    expect(after).toBe(`edge#A->B {\n  direction: up;\n}\n`);
    expect(stdout.join("")).toContain("tidied");
  });

  it("preserves duplicate rules when --no-merge is passed", async () => {
    const file = await writeStyle(
      "dup.krs.style",
      `edge#A->B { direction: down; }\nedge#A->B { direction: up; }\n`,
    );
    captureStdout();
    await tidyStyle([file], { noMerge: true });

    const after = readFileSync(file, "utf8");
    // Both rules survive (separated by a blank line) but properties are
    // still axis-ordered.
    expect(after).toMatch(/direction: down;[\s\S]+direction: up;/);
    expect(after.match(/edge#A->B/g)?.length).toBe(2);
  });
});

describe("tidyStyle() --check mode", () => {
  it("exits 1 when a file would change and writes the diff hint to stderr", async () => {
    const file = await writeStyle("drift.krs.style", `service { shape: user; color: red; }\n`);
    const before = readFileSync(file, "utf8");
    const exit = mockExit();
    const stderr = captureStderr();

    await expect(tidyStyle([file], { check: true })).rejects.toThrow("process.exit(1)");

    expect(readFileSync(file, "utf8")).toBe(before); // no write
    expect(stderr.join("")).toContain("would be tidied");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits 0 when every file is already tidy", async () => {
    const file = await writeStyle("tidy.krs.style", `service {\n  color: red;\n}\n`);
    captureStderr();

    // No exit(1) thrown — the call should resolve.
    await tidyStyle([file], { check: true });
    expect(true).toBe(true);
  });
});

describe("tidyStyle() --stdin mode", () => {
  it("reads stdin and writes tidied output to stdout", async () => {
    const src = `service { shape: user; color: red; }\n`;
    const stdout = captureStdout();
    const fakeStdin = {
      setEncoding: vi.fn<(encoding: string) => void>(),
      on: vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>(
        (event, handler) => {
          if (event === "data") handler(src);
          if (event === "end") handler();
        },
      ),
    };
    vi.spyOn(process, "stdin", "get").mockReturnValue(fakeStdin as unknown as typeof process.stdin);

    await tidyStyle([], { stdin: true });

    const out = stdout.join("");
    expect(out).toContain("color: red");
    expect(out).toContain("shape: user");
    expect(out.indexOf("color:")).toBeLessThan(out.indexOf("shape:"));
  });
});

describe("tidyStyle() with no targets", () => {
  it("reports `No .krs.style files found.` and exits 0", async () => {
    const exit = mockExit();
    const stderr = captureStderr();
    // Run from a fresh temp dir with no .krs.style files.
    const cwd = process.cwd;
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

    await expect(tidyStyle([], {})).rejects.toThrow("process.exit(0)");
    expect(stderr.join("")).toContain("No .krs.style files found");
    expect(exit).toHaveBeenCalledWith(0);

    process.cwd = cwd;
  });
});
