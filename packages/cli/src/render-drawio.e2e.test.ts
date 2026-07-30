import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { render } from "./render.js";

/**
 * AT-0057: draw.io export through the real CLI path.
 *
 * Unlike `render.test.ts` (which mocks `buildDrawioProject`), these tests run
 * `render()` end-to-end over real `examples/` inputs and assert on the emitted
 * mxGraph XML: the multipage mxfile shape (§1), single-view selection
 * (§5 / §6), and the `data-karasu-*` metadata contract (§8).
 *
 * TPL-1024 (test through the real wiring, not the mock seam) /
 * TPL-219 (single grammar for exported ids — assertions reuse the
 * exporter's sanitized `system_...` page-id shape).
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const GETTING_STARTED_KRS = join(REPO_ROOT, "examples/ja/getting-started/index.krs");
const MULTIFILE_ROOT = join(REPO_ROOT, "examples/ja/ec-platform/05-multifile/system.krs");
const ORG_KRS = join(REPO_ROOT, "examples/ja/org/system.krs");

function countDiagrams(xml: string): number {
  return [...xml.matchAll(/<diagram\b/g)].length;
}

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

describe("AT-0057 karasu render --format drawio — integration with real examples", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let streams: ReturnType<typeof captureStreams>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-render-drawio-e2e-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    streams = captureStreams();
  });

  afterEach(() => {
    streams.restore();
    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("default --format drawio writes a multipage mxfile (host=karasu)", async () => {
    const outPath = join(tmpDir, "getting-started.drawio");
    await render(GETTING_STARTED_KRS, { format: "drawio", output: outPath });

    expect(exitSpy).not.toHaveBeenCalled();
    const xml = readFileSync(outPath, "utf-8");
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(xml).toContain(`<mxfile host="karasu"`);
    // Top-level system page plus per-level drill-down pages.
    expect(xml).toContain(`<diagram id="system" name="System">`);
    expect(xml).toContain(`<diagram id="system_ECPlatform"`);
    expect(xml).toContain(`name="System ▸ `);
    // The example declares deploy and organization blocks, so both bundled
    // pages must be present as well.
    expect(xml).toContain(`<diagram id="deploy" name="Deploy">`);
    expect(xml).toContain(`<diagram id="org" name="Organization">`);
    expect(countDiagrams(xml)).toBeGreaterThanOrEqual(4);
  });

  it("multi-file project exports drill-down pages with breadcrumb names", async () => {
    await render(MULTIFILE_ROOT, { format: "drawio" });

    expect(exitSpy).not.toHaveBeenCalled();
    const xml = streams.stdout();
    expect(xml).toContain(`<diagram id="system" name="System">`);
    // Imported services (ECommerce / Payment) drill down under the system
    // page with ▸-breadcrumb names built from labels.
    expect(xml).toContain(`<diagram id="system_ECPlatform_ECommerce"`);
    expect(xml).toContain(`name="System ▸ ECプラットフォーム ▸ ECサイト"`);
  });

  it("--view system emits only the system pages (top + drill-downs)", async () => {
    await render(GETTING_STARTED_KRS, { format: "drawio", view: "system" });

    expect(exitSpy).not.toHaveBeenCalled();
    const xml = streams.stdout();
    expect(xml).toContain(`<diagram id="system" name="System">`);
    expect(xml).toContain(`<diagram id="system_ECPlatform"`);
    // Even though the source declares deploy and organization blocks, the
    // selected view excludes their pages.
    expect(xml).not.toContain(`<diagram id="deploy"`);
    expect(xml).not.toContain(`<diagram id="org"`);
  });

  it("--view org emits only the org diagram and exits 0", async () => {
    const outPath = join(tmpDir, "org-only.drawio");
    await render(ORG_KRS, { format: "drawio", view: "org", output: outPath });

    expect(exitSpy).not.toHaveBeenCalled();
    const xml = readFileSync(outPath, "utf-8");
    expect(xml).toContain(`<diagram id="org" name="Organization">`);
    expect(xml).not.toContain(`<diagram id="system"`);
    expect(xml).not.toContain(`<diagram id="deploy"`);
    expect(countDiagrams(xml)).toBe(1);
  });

  it("drawio cells carry data-karasu-* attributes (id / kind, aggregated on aggregated edges)", async () => {
    // Two cross-service domain edges between the same service pair aggregate
    // into a single "2 domain edges" implicit edge (view-extract), which the
    // exporter must annotate with data-karasu-aggregated.
    const krsPath = join(tmpDir, "index.krs");
    writeFileSync(
      krsPath,
      `system Shop {
  service ECommerce {
    domain Contract {}
    domain Order {}
  }
  service Billing {
    domain Invoicing {
      Invoicing -> Contract "from contract"
      Invoicing -> Order "from order"
    }
  }
}
`,
      "utf-8",
    );

    await render(krsPath, { format: "drawio" });

    expect(exitSpy).not.toHaveBeenCalled();
    const xml = streams.stdout();
    expect(xml).toContain(`data-karasu-id="ECommerce"`);
    expect(xml).toContain(`data-karasu-kind="service"`);
    expect(xml).toContain(`value="2 domain edges"`);
    expect(xml).toContain(`data-karasu-aggregated="Invoicing-&gt;Contract,Invoicing-&gt;Order"`);
  });
});
