import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Use vi.hoisted() so mock functions are initialized before vi.mock hoisting
const { mockBuildAllViewsSvgProject, mockCompileProject, mockBuildDrawioProject } = vi.hoisted(
  () => ({
    mockBuildAllViewsSvgProject: vi.fn<() => Promise<unknown>>(),
    mockCompileProject: vi.fn<() => Promise<unknown>>(),
    mockBuildDrawioProject: vi.fn<() => Promise<unknown>>(),
  }),
);

vi.mock("@karasu-tools/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@karasu-tools/core")>();
  return {
    ...actual,
    buildAllViewsSvgProject: mockBuildAllViewsSvgProject,
    compileProject: mockCompileProject,
    buildDrawioProject: mockBuildDrawioProject,
  };
});

import { render, NodeFileSystemProvider } from "./render.js";

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-render-test-"));
  mockBuildAllViewsSvgProject.mockReset();
  mockCompileProject.mockReset();
  mockBuildDrawioProject.mockReset();
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

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "<svg>all</svg>",
      diagnostics: [],
      warnings: [],
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, {});

    expect(mockBuildAllViewsSvgProject).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledWith("<svg>all</svg>");
  });

  it("writes SVG to --output file instead of stdout", async () => {
    const filePath = join(tmpDir, "index.krs");
    const outputPath = join(tmpDir, "out.svg");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "<svg>all</svg>",
      diagnostics: [],
      warnings: [],
    });

    await render(filePath, { output: outputPath });

    const { readFile } = await import("node:fs/promises");
    expect(await readFile(outputPath, "utf-8")).toBe("<svg>all</svg>");
  });

  it("exits with code 1 when error-severity diagnostics are present", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "",
      diagnostics: [
        { severity: "error", code: "generic-text", params: { text: "unexpected token" } },
      ],
      warnings: [],
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

  it("prints warning-severity diagnostics to stderr and exits with code 0", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "<svg>all</svg>",
      diagnostics: [
        { severity: "warning", code: "generic-text", params: { text: "circular import detected" } },
      ],
      warnings: [],
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, {});

    expect(
      stderrSpy.mock.calls.some((args) => String(args[0]).includes("circular import detected")),
    ).toBe(true);
  });

  it("prints resolver warnings from the all-views path to stderr (Issue #1438)", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "<svg>all</svg>",
      diagnostics: [],
      warnings: [{ kind: "unassigned-domain", params: { domainId: "Orphan" } }],
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, {});

    expect(
      stderrSpy.mock.calls.some(
        (args) => String(args[0]).startsWith("Warning:") && String(args[0]).includes("Orphan"),
      ),
    ).toBe(true);
  });

  it("prints info-severity warnings (domain-dispersal) with an `Info:` prefix on the all-views path (Issue #1438)", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildAllViewsSvgProject.mockResolvedValue({
      svg: "<svg>all</svg>",
      diagnostics: [],
      warnings: [{ kind: "domain-dispersal", params: { domainId: "Order", services: ["A", "B"] } }],
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, {});

    const lines = stderrSpy.mock.calls.map((args) => String(args[0]));
    expect(lines.some((l) => l.startsWith("Info:") && l.includes("Order"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Warning:") && l.includes("Order"))).toBe(false);
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
      warnings: [{ kind: "unassigned-domain", params: { domainId: "UnusedNode" } }],
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "system" });

    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("Warning"))).toBe(true);
  });

  it("prints info-severity warnings (domain-dispersal) with an `Info:` prefix", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockCompileProject.mockResolvedValue({
      svg: "<svg>system</svg>",
      diagnostics: [],
      warnings: [{ kind: "domain-dispersal", params: { domainId: "Order", services: ["A", "B"] } }],
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { view: "system" });

    // domain-dispersal is info register (ADR-20260514-02): the CLI labels it
    // `Info:`, not `Warning:`.
    const lines = stderrSpy.mock.calls.map((args) => String(args[0]));
    expect(lines.some((l) => l.startsWith("Info:") && l.includes("Order"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Warning:") && l.includes("Order"))).toBe(false);
  });
});

// ── render: --format drawio ───────────────────────────────────────────────────

describe("render — --format drawio", () => {
  it("calls buildDrawioProject with view:all when --view is omitted", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildDrawioProject.mockResolvedValue({
      xml: "<mxfile></mxfile>",
      diagnostics: [],
      warnings: [],
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { format: "drawio" });

    expect(mockBuildDrawioProject).toHaveBeenCalledWith(
      expect.stringContaining("index.krs"),
      expect.any(Object),
      { view: "all" },
    );
    expect(stdoutSpy).toHaveBeenCalledWith("<mxfile></mxfile>");
  });

  it("passes system/deploy view narrowing through to buildDrawioProject", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildDrawioProject.mockResolvedValue({
      xml: "<mxfile></mxfile>",
      diagnostics: [],
      warnings: [],
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { format: "drawio", view: "deploy" });

    expect(mockBuildDrawioProject).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      view: "deploy",
    });
  });

  it("passes --view org through to buildDrawioProject", async () => {
    const filePath = join(tmpDir, "index.krs");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildDrawioProject.mockResolvedValue({
      xml: "<mxfile></mxfile>",
      diagnostics: [],
      warnings: [],
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await render(filePath, { format: "drawio", view: "org" });

    expect(mockBuildDrawioProject).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      view: "org",
    });
  });

  it("writes drawio XML to --output file when specified", async () => {
    const filePath = join(tmpDir, "index.krs");
    const outputPath = join(tmpDir, "out.drawio");
    await writeFile(filePath, "system { }", "utf-8");

    mockBuildDrawioProject.mockResolvedValue({
      xml: "<mxfile>content</mxfile>",
      diagnostics: [],
      warnings: [],
    });

    await render(filePath, { format: "drawio", output: outputPath });

    const { readFile } = await import("node:fs/promises");
    expect(await readFile(outputPath, "utf-8")).toBe("<mxfile>content</mxfile>");
  });
});
