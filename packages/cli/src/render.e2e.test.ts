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

  // #2707: an unquoted annotation parameter value is warned, not refused. The
  // spec promises a lifecycle annotation never gates rendering, so the diagram
  // must still be written; only `karasu fmt` stops on these.
  it("still renders a file whose annotation parameter value cannot be read — Issue #2707", async () => {
    const { writeFileSync } = await import("node:fs");
    const krsPath = join(tmpDir, "index.krs");
    const outPath = join(tmpDir, "out.svg");
    writeFileSync(
      krsPath,
      `system Shop {
  service Legacy @deprecated(until: 2026-12-31) {}
  service Billing @deprecated(until: "2026-Q3") @deprecated(until: "2027-Q3") {}
}
`,
      "utf-8",
    );

    await render(krsPath, { output: outPath });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, "utf-8")).toContain("<svg");
    expect(streams.stderr()).toContain("until");
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

/**
 * #2715: a printed `<file>:<line>:<column>` must be an address a reader can
 * follow. Each case parses the location back out of stderr, opens the file it
 * names, and checks that line holds the construct the diagnostic is about. The
 * imported files are padded past the entry's length, so a position read
 * against the entry could not land on a real line by accident.
 */
describe("karasu render: diagnostic locations name their file (#2715)", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let streams: ReturnType<typeof captureStreams>;
  const padding = Array.from({ length: 12 }, (_, i) => `// padding ${i + 1}`).join("\n");

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-render-loc-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    streams = captureStreams();
  });

  afterEach(() => {
    streams.restore();
    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** The `file`, `line`, `column` a stderr line claims for the first match of `message`. */
  function printedLocation(prefix: string, message: RegExp) {
    const line = streams
      .stderr()
      .split("\n")
      .find((l) => l.startsWith(`${prefix}: `) && message.test(l));
    expect(line).toBeDefined();
    const match = /^\w+: (.+):(\d+):(\d+): /.exec(line!);
    expect(match).not.toBeNull();
    return { file: match![1], line: Number(match![2]), column: Number(match![3]) };
  }

  /** The source line a printed location points at, read from the file it names. */
  function lineAt(location: { file: string; line: number }): string {
    return readFileSync(resolve(location.file), "utf-8").split("\n")[location.line - 1] ?? "";
  }

  it("prints a merged-model verdict at the imported file's line", async () => {
    const { writeFileSync } = await import("node:fs");
    const entry = join(tmpDir, "index.krs");
    const legacy = join(tmpDir, "legacy.krs");
    writeFileSync(entry, `import "./legacy.krs"\n\nsystem Next {\n  service Search\n}\n`);
    writeFileSync(legacy, `${padding}\nsystem Legacy {\n  service Search\n}\n`);

    await render(entry, { output: join(tmpDir, "out.svg") });

    const location = printedLocation("Warning", /"Search" appears in multiple locations/);
    expect(resolve(location.file)).toBe(legacy);
    expect(lineAt(location)).toContain("service Search");
    expect(location.column).toBe(3);
  });

  it("prints an imported file's parse error at that file's line", async () => {
    const { writeFileSync } = await import("node:fs");
    const entry = join(tmpDir, "index.krs");
    const slice = join(tmpDir, "slice.krs");
    writeFileSync(entry, `import "./slice.krs"\nsystem Shop {\n  service Api\n}\n`);
    writeFileSync(slice, `${padding}\nsystem Slice {\n  service Worker\n}\nuser Stray\n`);

    await render(entry, { output: join(tmpDir, "out.svg") });

    const location = printedLocation("Error", /top-level user/);
    expect(resolve(location.file)).toBe(slice);
    expect(lineAt(location)).toBe("user Stray");
    expect(location.column).toBe(1);
  });

  // The off-by-one on its own: one file, no imports. `user Bob` is line 4,
  // column 1 of a 4-line file, and used to print as `5:2`.
  it("prints a single-file position without shifting it", async () => {
    const { writeFileSync } = await import("node:fs");
    const entry = join(tmpDir, "single.krs");
    writeFileSync(entry, `system Shop {\n  service Api\n}\nuser Bob\n`);

    await render(entry, { output: join(tmpDir, "out.svg") });

    expect(streams.stderr()).toContain(`Error: ${entry}:4:1: `);
  });

  it("prints a style sheet's parse error at the sheet's line", async () => {
    const { writeFileSync } = await import("node:fs");
    const entry = join(tmpDir, "styled.krs");
    const theme = join(tmpDir, "theme.krs.style");
    writeFileSync(entry, `@import "./theme.krs.style"\n\nsystem Shop {\n  service Api\n}\n`);
    writeFileSync(theme, `/* 1 */\n/* 2 */\n/* 3 */\nservice {\n  fill: #ffffff;\n}\n}\n`);

    await render(entry, { output: join(tmpDir, "out.svg") });

    const location = printedLocation("Error", /Expected LeftBrace/);
    expect(resolve(location.file)).toBe(theme);
    expect(lineAt(location)).toBe("}");
    expect(location.line).toBe(7);
  });

  // #2802: the built-in icon set used to be registered by the browser app
  // only, so `karasu render` drew every `url()` icon and icon display mode
  // as a plain box, silently (TPL-1001, TPL-2802).
  describe("built-in icons resolve in karasu render (#2802)", () => {
    /** A path only `icons/database.svg` draws — the cylinder's side wall. */
    const DATABASE_PICTOGRAM = "M2 4v12c0 1.7 3.6 3 8 3s8-1.3 8-3V4";

    function writeStyledProject(shapeValue: string): { entry: string; theme: string } {
      const { writeFileSync } = require("node:fs") as typeof import("node:fs");
      const entry = join(tmpDir, "index.krs");
      const theme = join(tmpDir, "theme.krs.style");
      writeFileSync(entry, `@import "./theme.krs.style"\n\nsystem Shop {\n  service Api\n}\n`);
      writeFileSync(theme, `service {\n  shape: ${shapeValue};\n}\n`);
      return { entry, theme };
    }

    it('draws `shape: url("database")` as the built-in database icon', async () => {
      const { entry } = writeStyledProject(`url("database")`);

      await render(entry, { view: "system" });

      expect(streams.stdout()).toContain(DATABASE_PICTOGRAM);
      expect(streams.stderr()).not.toMatch(/style-unknown-icon|names no registered icon/);
    });

    it("warns when a url() names no icon, and still renders the node as a box", async () => {
      const { entry } = writeStyledProject(`url("databse")`);

      await render(entry, { view: "system" });

      expect(streams.stdout()).toContain("<svg");
      expect(streams.stdout()).not.toContain(DATABASE_PICTOGRAM);
      expect(streams.stderr()).toMatch(/^Warning: .*url\("databse"\) names no registered icon/m);
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
