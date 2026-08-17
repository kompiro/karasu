import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scan, scanFile } from "./locale-normalization-single-owner";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("locale-normalization-single-owner scanner", () => {
  it("real repo: no package re-implements the tag-matching rule", () => {
    expect(scan(REPO_ROOT)).toEqual([]);
  });

  it("real repo: the owner itself is allowed to spell the rule out", () => {
    // Guards the allowlist against rotting if `resolveLocaleTag` moves: if the
    // owner stopped matching this way, the exemption would be silently dead.
    const owner = resolve(REPO_ROOT, "packages/i18n/src/locale.ts");
    expect(scanFile(owner, REPO_ROOT)).toEqual([]);
    expect(readFileSync(owner, "utf8")).toMatch(/\.startsWith\(\s*"ja"\s*\)/);
  });

  describe("regression rehearsal", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "locale-owner-lint-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('flags a consumer that inlines startsWith("ja")', () => {
      const file = join(tempDir, "bad.ts");
      writeFileSync(file, 'return raw.toLowerCase().startsWith("ja") ? "ja" : "en";\n');

      const findings = scanFile(file, tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.line).toBe(1);
    });

    it("flags single-quoted and backtick spellings", () => {
      writeFileSync(join(tempDir, "a.ts"), "if (lang.startsWith('ja')) {}\n");
      writeFileSync(join(tempDir, "b.ts"), "if (lang.startsWith(`ja-`)) {}\n");

      expect(scan(tempDir, ["."])).toHaveLength(2);
    });

    it("flags the slice/substring comparison form", () => {
      writeFileSync(join(tempDir, "c.ts"), 'const l = tag.slice(0, 2) === "ja" ? "ja" : "en";\n');
      writeFileSync(join(tempDir, "d.ts"), "const m = tag.substring(0,2) === 'ja';\n");

      expect(scan(tempDir, ["."])).toHaveLength(2);
    });

    it("does not flag comparisons against an already-resolved Locale", () => {
      const file = join(tempDir, "fine.ts");
      writeFileSync(
        file,
        [
          'if (locale === "ja") return ja;',
          'const label = locale === "ja" ? "日本語" : "English";',
          't("nodeDetail.close");',
        ].join("\n"),
      );

      expect(scanFile(file, tempDir)).toEqual([]);
    });

    it("does not flag startsWith on unrelated prefixes", () => {
      const file = join(tempDir, "unrelated.ts");
      writeFileSync(
        file,
        ['if (id.startsWith("java-service")) {}', 'if (path.startsWith("/jobs")) {}'].join("\n"),
      );

      // "java-service" begins with the same two letters, so a pattern that
      // stopped at the quote would fire here.
      expect(scanFile(file, tempDir)).toEqual([]);
    });

    it("scans nested directories and skips build output", () => {
      const nested = join(tempDir, "src", "deep");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, "bad.ts"), 'x.startsWith("ja");\n');
      const dist = join(tempDir, "dist");
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "compiled.ts"), 'x.startsWith("ja");\n');

      const findings = scan(tempDir, ["."]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toContain("deep/bad.ts");
    });
  });
});
