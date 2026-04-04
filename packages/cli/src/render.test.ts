import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Use vi.hoisted() so mock functions are initialized before vi.mock hoisting
const { mockBuildAllViewsSvgProject, mockCompileProject } = vi.hoisted(() => ({
  mockBuildAllViewsSvgProject: vi.fn(),
  mockCompileProject: vi.fn(),
}));

vi.mock("@karasu/core", () => ({
  buildAllViewsSvgProject: mockBuildAllViewsSvgProject,
  compileProject: mockCompileProject,
}));

import { render, NodeFileSystemProvider } from "./render.js";

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-render-test-"));
  mockBuildAllViewsSvgProject.mockReset();
  mockCompileProject.mockReset();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── NodeFileSystemProvider ────────────────────────────────────────────────────

describe("NodeFileSystemProvider", () => {
  it("readFile returns file contents", async () => {
    const filePath = join(tmpDir, "test.krs");
    await writeFile(filePath, "system { }", "utf-8");
    const fs = new NodeFileSystemProvider();
    expect(await fs.readFile(filePath)).toBe("system { }");
  });

  it("readDir returns entries with kind", async () => {
    await writeFile(join(tmpDir, "a.krs"), "", "utf-8");
    const fs = new NodeFileSystemProvider();
    const entries = await fs.readDir(tmpDir);
    expect(entries).toContainEqual({ name: "a.krs", kind: "file" });
  });

  it("exists returns true for existing file", async () => {
    const filePath = join(tmpDir, "exists.krs");
    await writeFile(filePath, "", "utf-8");
    const fs = new NodeFileSystemProvider();
    expect(await fs.exists(filePath)).toBe(true);
  });

  it("exists returns false for missing file", async () => {
    const fs = new NodeFileSystemProvider();
    expect(await fs.exists(join(tmpDir, "missing.krs"))).toBe(false);
  });
});

// ── render: file-not-found ────────────────────────────────────────────────────

describe("render — file not found", () => {
  it("writes error to stderr and exits with code 1", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error("process.exit");
    });

    await expect(render(join(tmpDir, "missing.krs"), {})).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("File not found"))).toBe(
      true,
    );
  });
});

// ── render: all-views (default) ───────────────────────────────────────────────

describe("render — all-views (no --view)", () => {
  it("calls buildAllViewsSvgProject and writes SVG to stdout", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({ svg: "<svg>all</svg>", diagnostics: [] });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, {});

    expect(mockBuildAllViewsSvgProject).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledWith("<svg>all</svg>");
  });

  it("writes SVG to --output file instead of stdout", async () => {
    const filePath = join(tmpDir, "index.krs");
    const outputPath = join(tmpDir, "out.svg");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({ svg: "<svg>all</svg>", diagnostics: [] });

    await render(filePath, { output: outputPath });

    const { readFile } = await import("node:fs/promises");
    expect(await readFile(outputPath, "utf-8")).toBe("<svg>all</svg>");
  });

  it("exits with code 1 when diagnostics are present", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "",
      diagnostics: [{ severity: "error", message: "unexpected token" }],
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error("process.exit");
    });

    await expect(render(filePath, {})).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("unexpected token"))).toBe(
      true,
    );
  });
});

// ── render: --view specified ──────────────────────────────────────────────────

describe("render — --view system", () => {
  it("calls compileProject with diagramType system", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockCompileProject.mockResolvedValue({
      svg: "<svg>system</svg>",
      diagnostics: [],
      warnings: [],
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "system" });

    expect(mockCompileProject).toHaveBeenCalledWith(
      expect.stringContaining("index.krs"),
      expect.any(Object),
      { diagramType: "system" },
    );
    expect(stdoutSpy).toHaveBeenCalledWith("<svg>system</svg>");
  });

  it("calls compileProject with diagramType deploy", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockCompileProject.mockResolvedValue({
      svg: "<svg>deploy</svg>",
      diagnostics: [],
      warnings: [],
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "deploy" });

    expect(mockCompileProject).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      diagramType: "deploy",
    });
  });

  it("calls compileProject with diagramType org", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockCompileProject.mockResolvedValue({ svg: "<svg>org</svg>", diagnostics: [], warnings: [] });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "org" });

    expect(mockCompileProject).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      diagramType: "org",
    });
  });

  it("prints warnings to stderr but exits with code 0", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockCompileProject.mockResolvedValue({
      svg: "<svg>system</svg>",
      diagnostics: [],
      warnings: [{ message: "unused node", kind: "unusedNode" }],
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "system" });

    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("Warning"))).toBe(true);
  });
});
