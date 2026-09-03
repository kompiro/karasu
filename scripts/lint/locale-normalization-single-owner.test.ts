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
    // The exemption is by path, so it rots silently in two ways: the path can
    // go stale if `resolveLocaleTag` moves, and the patterns can drift until
    // they no longer see the owner at all — at which point the entry is dead
    // config and nothing says so. Both halves are asserted here.
    const owner = resolve(REPO_ROOT, "packages/i18n/src/locale.ts");
    expect(readFileSync(owner, "utf8")).toMatch(/export function resolveLocaleTag\b/);
    expect(scanFile(owner, REPO_ROOT)).toEqual([]);

    // Same file seen from a root that puts it outside the allowlist: the
    // scanner has to have something to say about it, or the exemption above
    // is not what makes the first expectation pass.
    expect(scanFile(owner, resolve(REPO_ROOT, "packages/i18n/src"))).not.toEqual([]);
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

    it("flags the primary-subtag comparison form, in either polarity", () => {
      writeFileSync(join(tempDir, "e.ts"), 'const l = tag.split(/[-_.]/)[0] === "ja";\n');
      writeFileSync(join(tempDir, "f.ts"), "const n = tag.split('-').at(0) === 'japanese';\n");
      writeFileSync(join(tempDir, "g.ts"), 'if (tag.split("-")[0] !== "ja") return en;\n');

      expect(scan(tempDir, ["."])).toHaveLength(3);
    });

    it("flags a consumer that copies the rule across two lines", () => {
      // The shape `resolveLocaleTag` actually has: the split lands in a
      // variable and the comparison happens later, so neither line carries
      // both halves. What gives it away is the Windows allowance — nothing
      // but a copy of this rule spells `"japanese"` next to `"ja"`.
      const file = join(tempDir, "copied.ts");
      writeFileSync(
        file,
        [
          'const JAPANESE = new Set(["ja", "japanese"]);',
          'const primary = (raw ?? "").toLowerCase().split(/[-_.@]/, 1)[0];',
          'return JAPANESE.has(primary) ? "ja" : "en";',
        ].join("\n"),
      );

      const findings = scanFile(file, tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.line).toBe(1);
    });

    it("flags a switch on the primary subtag", () => {
      const file = join(tempDir, "switched.ts");
      writeFileSync(file, ["switch (primary) {", '  case "japanese":', '  case "ja":'].join("\n"));

      expect(scanFile(file, tempDir)).toHaveLength(1);
    });

    it("does not flag Japanese as a translated label", () => {
      // `en.ts` carries `"languageSelector.japanese": "Japanese"`, and a test
      // asserts `{ value: "ja", text: "Japanese" }`. Neither is a matching
      // rule, so the language name only counts in a comparison or beside the
      // `"ja"` subtag.
      const file = join(tempDir, "labels.ts");
      writeFileSync(
        file,
        [
          '"languageSelector.japanese": "Japanese",',
          'const option = { value: "ja", text: "Japanese" };',
        ].join("\n"),
      );

      expect(scanFile(file, tempDir)).toEqual([]);
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
      // split alone, only on the Japanese tag being spelled out next to it.
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
