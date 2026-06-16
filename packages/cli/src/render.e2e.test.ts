import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { render } from "./render.js";

/**
 * AT-0042: karasu render — end-to-end over real example files.
 *
 * These tests run the `render` function with real `examples/` inputs
 * instead of the mocked unit test suite in `render.test.ts`. They cover
 * the manual verification checklist from `docs/acceptance/0042-cli-render-command.md`:
 *
 *  - default all-views output is a valid SVG containing tab markers
 *  - `--output` writes the SVG to disk
 *  - `--view system` / `--view deploy` / `--view org` produce valid
 *    single-view SVGs
 *  - multi-file projects resolve imports
 *  - nonexistent files exit with code 1 and a stderr message
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const ECPLATFORM_ROOT = join(REPO_ROOT, "examples/ja/ec-platform");
const EC_SYSTEM_KRS = join(ECPLATFORM_ROOT, "01-system.krs");
const DEPLOY_KRS = join(ECPLATFORM_ROOT, "06-deploy/deploy.krs");
const MULTIFILE_ROOT = join(ECPLATFORM_ROOT, "05-multifile/system.krs");
const ORG_KRS = join(REPO_ROOT, "examples/ja/org/system.krs");

function captureStreams() {
  let stdout = "";
  let stderr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  return {
    stdout: () => stdout,
    stderr: () => stderr,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

describe("AT-0042 karasu render — integration with real examples", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let streams: ReturnType<typeof captureStreams>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-render-e2e-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    streams = captureStreams();
  });

  afterEach(() => {
    streams.restore();
    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("default (no --view) writes a bundled all-views SVG to stdout", async () => {
    await render(EC_SYSTEM_KRS, {});

    const out = streams.stdout();
    expect(out).toContain("<svg");
    expect(out).toContain("</svg>");
    // The bundled all-views SVG ships tab-bar markers (krs-tab / krs-pane).
    expect(out).toMatch(/krs-tab|krs-pane/);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--output writes the SVG to disk and leaves stdout empty", async () => {
    const outPath = join(tmpDir, "ec-platform.svg");
    await render(EC_SYSTEM_KRS, { output: outPath });

    expect(streams.stdout()).toBe("");
    const file = readFileSync(outPath, "utf-8");
    expect(file).toContain("<svg");
    expect(file).toContain("</svg>");
  });

  it("--view system produces a single-view system SVG without tab markers", async () => {
    await render(EC_SYSTEM_KRS, { view: "system" });

    const out = streams.stdout();
    expect(out).toContain("<svg");
    expect(out).toContain("</svg>");
    // Single-view output should NOT include the tab-bar bundle wrapper.
    expect(out).not.toMatch(/krs-tab-bar/);
  });

  it("--view deploy produces a single-view deploy SVG", async () => {
    await render(DEPLOY_KRS, { view: "deploy" });

    const out = streams.stdout();
    expect(out).toContain("<svg");
    expect(out).toContain("</svg>");
  });

  it("--view org produces a single-view org SVG", async () => {
    await render(ORG_KRS, { view: "org" });

    const out = streams.stdout();
    expect(out).toContain("<svg");
    expect(out).toContain("</svg>");
  });

  it("multi-file project resolves imports without error", async () => {
    await render(MULTIFILE_ROOT, {});

    const out = streams.stdout();
    expect(out).toContain("<svg");
    expect(streams.stderr()).not.toContain("file not found");
    expect(streams.stderr()).not.toContain("Error:");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Issue #1438: resolver warnings (`domain-dispersal`, `unassigned-*`, …)
  // are a model-level fact and must surface on the all-views path (no
  // `--view`) just as they do per-view.
  it("default (no --view) surfaces resolver warnings, matching the per-view path — Issue #1438", async () => {
    const { writeFileSync } = await import("node:fs");
    const krsPath = join(tmpDir, "index.krs");
    writeFileSync(
      krsPath,
      `domain Orphan {}

system EC {
  service ECommerce { domain Order {} }
  service Legacy { domain Order {} }
}
`,
      "utf-8",
    );

    await render(krsPath, {});
    const allViewsStderr = streams.stderr();
    // Dispersed domain prints as `Info:`, unassigned domain as `Warning:`.
    expect(allViewsStderr).toContain('Domain "Order"');
    expect(allViewsStderr).toContain('Domain "Orphan"');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("nonexistent file writes a File not found error and exits with code 1", async () => {
    await render(join(REPO_ROOT, "examples/__nonexistent__.krs"), {});

    expect(streams.stderr()).toContain("File not found");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
