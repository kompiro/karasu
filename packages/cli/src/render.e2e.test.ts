import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const GETTING_STARTED_KRS = join(REPO_ROOT, "examples/ja/getting-started/index.krs");

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

  // #1819: the cross-domain-store-access info diagnostic is a model-level fact
  // and must surface on the CLI render path (end-to-end AT for the diagnostic).
  it("surfaces the cross-domain-store-access info diagnostic — Issue #1819", async () => {
    const { writeFileSync } = await import("node:fs");
    const krsPath = join(tmpDir, "index.krs");
    writeFileSync(
      krsPath,
      `system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
    }
    domain Billing {
      usecase Charge {
        resource OrderDB.orders { operations update }
      }
    }
  }
  database OrderDB { table orders }
}
`,
      "utf-8",
    );

    await render(krsPath, {});
    const stderr = streams.stderr();
    // Billing reaches into Ordering's owned leaf → info, not a blocking error.
    expect(stderr).toContain('Domain "Billing"');
    expect(stderr).toContain("OrderDB.orders");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("nonexistent file writes a File not found error and exits with code 1", async () => {
    await render(join(REPO_ROOT, "examples/__nonexistent__.krs"), {});

    expect(streams.stderr()).toContain("File not found");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // AT-0042 §7: a project with a deploy block renders both the system and
  // deploy panes in the default all-views bundle.
  it("default render of a deploy file bundles both system and deploy panes", async () => {
    await render(DEPLOY_KRS, {});

    const out = streams.stdout();
    expect(out).toContain("krs-pane--system");
    expect(out).toContain("krs-pane--deploy");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-1062 AT-M: --include-matrix writes a CRUD-matrix SVG sidecar next to
  // --output (warning paths live in render.ts).
  it("--include-matrix writes the SVG and a sibling .matrix.svg", async () => {
    const outPath = join(tmpDir, "out.svg");
    await render(GETTING_STARTED_KRS, { output: outPath, includeMatrix: true });

    expect(readFileSync(outPath, "utf-8")).toContain("<svg");
    const matrixSvg = readFileSync(join(tmpDir, "out.matrix.svg"), "utf-8");
    expect(matrixSvg.startsWith("<svg")).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--include-matrix without --output warns and skips the sidecar", async () => {
    await render(GETTING_STARTED_KRS, { includeMatrix: true });

    expect(streams.stdout()).toContain("<svg");
    expect(streams.stderr()).toContain(
      "--include-matrix requires --output; matrix.svg not written",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("--include-matrix with --format drawio warns and writes the drawio output only", async () => {
    const outPath = join(tmpDir, "arch.drawio");
    await render(GETTING_STARTED_KRS, { format: "drawio", output: outPath, includeMatrix: true });

    expect(readFileSync(outPath, "utf-8")).toContain("<mxfile");
    expect(streams.stderr()).toContain(
      "--include-matrix is only supported with --format svg; matrix.svg not written",
    );
    expect(existsSync(join(tmpDir, "arch.matrix.svg"))).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
