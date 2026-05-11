import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-lint-style-test-"));
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

import { lintStyle } from "./lint-style.js";

describe("lintStyle() with explicit files", () => {
  it("reports an enum-value error and exits 1", async () => {
    const file = await writeStyle("bad.krs.style", `edge { direction: dwon; }\n`);
    const stdout = captureStdout();
    const exit = mockExit();

    await expect(lintStyle([file], {})).rejects.toThrow("process.exit(1)");

    const out = stdout.join("");
    expect(out).toContain(file);
    expect(out).toContain("error:");
    expect(out).toContain("dwon");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports an invalid-hex-color error and exits 1", async () => {
    const file = await writeStyle("badhex.krs.style", `service { color: #zzzz; }\n`);
    const stdout = captureStdout();
    const exit = mockExit();

    await expect(lintStyle([file], {})).rejects.toThrow("process.exit(1)");

    expect(stdout.join("")).toContain("Invalid hex color");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports an unknown-property warning but does NOT exit 1", async () => {
    const file = await writeStyle("unknown.krs.style", `service { color2: red; }\n`);
    const stdout = captureStdout();

    // No exit thrown — warnings do not fail.
    await lintStyle([file], {});

    const out = stdout.join("");
    expect(out).toContain("warning:");
    expect(out).toContain("color2");
  });

  it("emits nothing for a clean file", async () => {
    const file = await writeStyle("ok.krs.style", `service { color: red; }\n`);
    const stdout = captureStdout();

    await lintStyle([file], {});

    expect(stdout.join("")).toBe("");
  });

  it("emits errors from multiple files in <file>:<line>:<col> form", async () => {
    const f1 = await writeStyle("a.krs.style", `edge { direction: dwon; }\n`);
    const f2 = await writeStyle("b.krs.style", `service { opacity: 1.5; }\n`);
    const stdout = captureStdout();
    mockExit();

    await expect(lintStyle([f1, f2], {})).rejects.toThrow("process.exit(1)");

    const lines = stdout.join("").split("\n").filter(Boolean);
    expect(lines.some((l) => l.startsWith(f1) && l.includes("error:"))).toBe(true);
    expect(lines.some((l) => l.startsWith(f2) && l.includes("error:"))).toBe(true);
  });
});

describe("lintStyle() --stdin mode", () => {
  it("reads stdin and reports diagnostics with `stdin:` prefix", async () => {
    const stdout = captureStdout();
    const fakeStdin = {
      setEncoding: vi.fn<(encoding: string) => void>(),
      on: vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>(
        (event, handler) => {
          if (event === "data") handler(`edge { direction: dwon; }\n`);
          if (event === "end") handler();
        },
      ),
    };
    vi.spyOn(process, "stdin", "get").mockReturnValue(fakeStdin as unknown as typeof process.stdin);
    const exit = mockExit();

    await expect(lintStyle([], { stdin: true })).rejects.toThrow("process.exit(1)");

    expect(stdout.join("")).toContain("stdin:");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("lintStyle() with no targets", () => {
  it("reports `No .krs.style files found.` and exits 0", async () => {
    const exit = mockExit();
    const stderr = captureStderr();
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

    await expect(lintStyle([], {})).rejects.toThrow("process.exit(0)");
    expect(stderr.join("")).toContain("No .krs.style files found");
    expect(exit).toHaveBeenCalledWith(0);
  });
});
