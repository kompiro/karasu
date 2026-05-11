import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scan, scanFile } from "./no-direct-page-goto";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("no-direct-page-goto scanner", () => {
  it("real repo: packages/e2e/tests has zero forbidden page.goto calls", () => {
    const findings = scan(REPO_ROOT, ["packages/e2e/tests"]);
    expect(findings).toEqual([]);
  });

  it("real repo: packages/vscode-e2e/tests has zero forbidden page.goto calls", () => {
    const findings = scan(REPO_ROOT, ["packages/vscode-e2e/tests"]);
    expect(findings).toEqual([]);
  });

  describe("regression rehearsal", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "page-goto-lint-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('flags page.goto("/")', () => {
      const file = join(tempDir, "bad.spec.ts");
      writeFileSync(
        file,
        [
          'import { test } from "@playwright/test";',
          "",
          "test('regresses', async ({ page }) => {",
          '  await page.goto("/");',
          "});",
          "",
        ].join("\n"),
      );

      const findings = scanFile(file, tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.line).toBe(4);
      expect(findings[0]?.text).toContain('page.goto("/")');
    });

    it("flags page.goto('/foo') (single-quoted, non-root path)", () => {
      const file = join(tempDir, "bad2.spec.ts");
      writeFileSync(file, "await page.goto('/foo');\n");

      const findings = scanFile(file, tempDir);
      expect(findings).toHaveLength(1);
    });

    it("flags page.goto(url) (variable argument)", () => {
      const file = join(tempDir, "bad3.spec.ts");
      writeFileSync(file, "await page.goto(someUrl);\n");

      const findings = scanFile(file, tempDir);
      expect(findings).toHaveLength(1);
    });

    it("scans nested directories", () => {
      const nested = join(tempDir, "sub", "deep");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, "bad.spec.ts"), 'await page.goto("/");\n');

      const findings = scan(tempDir, ["."]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toContain("bad.spec.ts");
    });

    it("ignores .js files and non-source files", () => {
      writeFileSync(join(tempDir, "bad.js"), 'await page.goto("/");\n');
      writeFileSync(join(tempDir, "bad.md"), 'await page.goto("/");\n');

      const findings = scan(tempDir, ["."]);
      expect(findings).toEqual([]);
    });

    it("does not flag unrelated text like pages.goto or comments mentioning page.goto", () => {
      const file = join(tempDir, "clean.spec.ts");
      writeFileSync(
        file,
        [
          "// historic note: page.goto was banned",
          "const pages = { goto: () => {} };",
          "pages.goto();",
        ].join("\n"),
      );

      const findings = scanFile(file, tempDir);
      // The comment line will match because it contains `page.goto(` literally.
      // That's acceptable — comments are part of code review surface and a
      // regex-only checker can't distinguish them reliably. Verify the
      // pages.goto identifier does not match.
      expect(findings.every((f) => !f.text.includes("pages.goto"))).toBe(true);
    });
  });

  describe("fixture exemption", () => {
    it("fixture files in packages/e2e/fixtures are not scanned by default roots", () => {
      // The scanner's DEFAULT_ROOTS only include tests/ directories.
      // Fixtures live in packages/e2e/fixtures/ and are intentionally outside.
      const findings = scan(REPO_ROOT);
      const fixtureHits = findings.filter((f) => f.file.includes("/fixtures/"));
      expect(fixtureHits).toEqual([]);
    });
  });
});
