import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-fmt-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function writeKrs(name: string, content: string): Promise<string> {
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

import { fmt } from "./fmt.js";

// ── fmt() — explicit files ────────────────────────────────────────────────────

describe("fmt() with explicit files", () => {
  it("rewrites an unformatted file and prints its path", async () => {
    const file = await writeKrs("a.krs", `system S{label "S"}`);
    const stdout = captureStdout();

    await fmt([file], {});

    const result = readFileSync(file, "utf8");
    expect(result).toContain(`system S {`);
    expect(result).toContain(`  label "S"`);
    expect(stdout.some((s) => s.includes("a.krs"))).toBe(true);
  });

  it("does not rewrite an already-formatted file", async () => {
    const src = `system S {}\n`;
    const file = await writeKrs("b.krs", src);
    captureStdout();

    await fmt([file], {});

    expect(readFileSync(file, "utf8")).toBe(src);
  });

  it("--check mode exits 1 when file would change", async () => {
    const file = await writeKrs("c.krs", `system S{}`);
    const stderr = captureStderr();
    const exitSpy = mockExit();

    await expect(fmt([file], { check: true })).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr.some((s) => s.includes("would be reformatted"))).toBe(true);
  });

  it("--check mode exits 0 when file is already formatted", async () => {
    const file = await writeKrs("d.krs", `system S {}\n`);
    captureStdout();

    // Should not throw (no exit called)
    await fmt([file], { check: true });
  });

  it("reports parse error to stderr and exits 2", async () => {
    const file = await writeKrs("bad.krs", `system {`);
    const stderr = captureStderr();
    const exitSpy = mockExit();

    await expect(fmt([file], {})).rejects.toThrow("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderr.some((s) => s.includes("bad.krs"))).toBe(true);
  });
});

// ── fmt() — no files, default discovery ──────────────────────────────────────

describe("fmt() with no files (default discovery)", () => {
  it("discovers and formats .krs files under cwd", async () => {
    const file = await writeKrs("disco.krs", `system S{}`);
    captureStdout();

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await fmt([], {});
    cwdSpy.mockRestore();

    expect(readFileSync(file, "utf8")).toContain(`system S {`);
  });

  it("exits 0 with message when no .krs files found", async () => {
    const stderr = captureStderr();
    const exitSpy = mockExit();

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await expect(fmt([], {})).rejects.toThrow("process.exit(0)");
    cwdSpy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stderr.some((s) => s.includes("No .krs files found"))).toBe(true);
  });

  it("skips node_modules directories", async () => {
    const nodeModules = join(tmpDir, "node_modules");
    await mkdir(nodeModules);
    await writeFile(join(nodeModules, "skip.krs"), `system S{}`, "utf8");
    captureStdout();

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    // No files found → exits 0
    const exitSpy = mockExit();
    await expect(fmt([], {})).rejects.toThrow("process.exit(0)");
    cwdSpy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ── fmt() — stdin mode ────────────────────────────────────────────────────────

describe("fmt() --stdin mode", () => {
  it("reads stdin, formats, and writes to stdout", async () => {
    const src = `system S{label "S"}`;
    const stdout = captureStdout();

    // Mock stdin to emit data then end
    const fakeStdin = {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") handler(src);
        if (event === "end") handler();
      }),
    };
    vi.spyOn(process, "stdin", "get").mockReturnValue(fakeStdin as unknown as typeof process.stdin);

    await fmt([], { stdin: true });

    const combined = stdout.join("");
    expect(combined).toContain(`system S {`);
    expect(combined).toContain(`  label "S"`);
  });

  it("reports parse error to stderr and exits 2 on stdin parse failure", async () => {
    const stderr = captureStderr();
    const exitSpy = mockExit();

    const fakeStdin = {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") handler(`system {`);
        if (event === "end") handler();
      }),
    };
    vi.spyOn(process, "stdin", "get").mockReturnValue(fakeStdin as unknown as typeof process.stdin);

    await expect(fmt([], { stdin: true })).rejects.toThrow("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderr.some((s) => s.includes("stdin"))).toBe(true);
  });
});
