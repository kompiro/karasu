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

  it("real repo: the allowlist still points at the rule's owner", () => {
    // The exemption is by path, so it rots silently if `resolveLocaleTag`
    // moves. It is precautionary since ADR-2535 — the owner compares with a
    // `Set` lookup, which no pattern here recognizes — so what is worth
    // asserting is that the exempted path is still where the rule lives.
    const owner = resolve(REPO_ROOT, "packages/i18n/src/locale.ts");
    expect(scanFile(owner, REPO_ROOT)).toEqual([]);
    expect(readFileSync(owner, "utf8")).toMatch(/export function resolveLocaleTag\b/);
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

    it("flags the primary-subtag comparison form the owner now uses", () => {
      writeFileSync(join(tempDir, "e.ts"), 'const l = tag.split(/[-_.]/)[0] === "ja";\n');
      writeFileSync(join(tempDir, "f.ts"), "const n = tag.split('-').at(0) === 'japanese';\n");

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

    it("does not flag unrelated identifiers that begin the same way", () => {
      const file = join(tempDir, "unrelated.ts");
      writeFileSync(
        file,
        [
          'if (id.startsWith("java-service")) {}',
          'if (path.startsWith("/jobs")) {}',
          'if (parts.split("/")[0] === "jamstack") {}',
          "const stem = name.split(/[.]/)[0];",
          "const major = version.split(/[._-]/)[0];",
          "const head = id.split(/[-_]/)[0];",
        ].join("\n"),
      );

      // "java-service" and "jamstack" begin with the same two letters, so a
      // pattern that stopped at the quote would fire on both. The three splits
      // take a filename, a version and a compound identifier apart on the very
      // separators a locale tag uses — which is why no pattern here keys on the
      // split alone, only on a comparison against the Japanese tag.
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
