import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@kompiro/adr-tools";
import {
  type Finding,
  type ParsedTpl,
  formatFinding,
  parseFrontmatter,
  validateAll,
  validateFile,
  validateReadmeIndex,
  validateRelatedTo,
} from "./validate.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../..");
const TPL_DIR = join(REPO_ROOT, "docs/test-perspectives");
const README_PATH = join(TPL_DIR, "README.md");

function discoverPackages(): string[] {
  const root = join(REPO_ROOT, "packages");
  return readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory());
}

const adrConfig = loadConfig(REPO_ROOT);
const VALID_TOPICS = adrConfig.topics;
const VALID_PACKAGES = discoverPackages();

function findingKinds(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.kind);
}

function makeFm(overrides: Record<string, unknown> = {}): string {
  const base = {
    id: "TPL-20260510-99",
    title: "test entry",
    status: "active",
    date: "2026-05-10",
    applicable_to: ["pattern"],
    discovered_from: [{ issue: "#0" }],
    topic: "testing",
    scope: { packages: ["core"] },
    ...overrides,
  };
  // Render YAML manually to keep deps minimal in tests.
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue; // explicit undefined → omit the field entirely
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        continue;
      }
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item);
          if (entries.length === 1) {
            lines.push(`  - ${entries[0][0]}: ${JSON.stringify(entries[0][1])}`);
          } else {
            lines.push("  -");
            for (const [ek, ev] of entries) {
              lines.push(`    ${ek}: ${JSON.stringify(ev)}`);
            }
          }
        } else {
          lines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof v === "object" && v !== null) {
      lines.push(`${k}:`);
      for (const [sk, sv] of Object.entries(v)) {
        if (Array.isArray(sv)) {
          lines.push(`  ${sk}:`);
          for (const item of sv) lines.push(`    - ${JSON.stringify(item)}`);
        } else {
          lines.push(`  ${sk}: ${JSON.stringify(sv)}`);
        }
      }
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push("# Body");
  lines.push("");
  lines.push("placeholder body");
  return lines.join("\n");
}

const CTX = {
  validTopics: VALID_TOPICS,
  validPackages: VALID_PACKAGES,
};

// ---------------------------------------------------------------------------
// Regression fence: current main must pass cleanly
// ---------------------------------------------------------------------------

describe("regression fence — current TPL corpus", () => {
  it("validates all existing TPLs without findings", () => {
    const result = validateAll({
      tplDir: TPL_DIR,
      validTopics: VALID_TOPICS,
      validPackages: VALID_PACKAGES,
      readmePath: README_PATH,
    });

    if (result.findings.length > 0) {
      throw new Error(
        `Unexpected findings:\n${result.findings.map((f) => "  - " + formatFinding(f)).join("\n")}`,
      );
    }
    expect(result.findings).toEqual([]);
    expect(result.parsed.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Per-finding-kind tests
// ---------------------------------------------------------------------------

describe("per-Finding-kind coverage", () => {
  it("yaml-parse-error", () => {
    // Unclosed double-quoted string is a hard parse error in js-yaml.
    const broken = '---\nid: "unterminated\ntitle: x\n---\nbody\n';
    const { findings } = validateFile("TPL-20260510-99-x.md", broken, CTX);
    expect(findingKinds(findings)).toContain("yaml-parse-error");
  });

  it("missing-frontmatter", () => {
    const { findings } = validateFile("TPL-20260510-99-x.md", "no frontmatter here\n", CTX);
    expect(findingKinds(findings)).toContain("missing-frontmatter");
  });

  it("filename-id-mismatch", () => {
    const content = makeFm({ id: "TPL-20260510-77" });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("filename-id-mismatch");
  });

  it("id-format-invalid", () => {
    const content = makeFm({ id: "BAD-ID" });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("id-format-invalid");
  });

  it("missing-required-field — title", () => {
    const content = makeFm({ title: undefined });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(
      findings.some(
        (f) => f.kind === "missing-required-field" && (f as { field: string }).field === "title",
      ),
    ).toBe(true);
  });

  it("status-invalid", () => {
    const content = makeFm({ status: "wip" });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("status-invalid");
  });

  it("topic-invalid", () => {
    const content = makeFm({ topic: "not-a-real-topic" });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("topic-invalid");
  });

  it("applicable-to-empty", () => {
    const content = makeFm({ applicable_to: [] });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("applicable-to-empty");
  });

  it("discovered-from-empty", () => {
    const content = makeFm({ discovered_from: [] });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("discovered-from-empty");
  });

  it("discovered-from-unknown-key", () => {
    const content = makeFm({ discovered_from: [{ unknown_key: "x" }] });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("discovered-from-unknown-key");
  });

  it("scope-package-missing", () => {
    const content = makeFm({ scope: { packages: ["nonexistent-pkg"] } });
    const { findings } = validateFile("TPL-20260510-99-x.md", content, CTX);
    expect(findingKinds(findings)).toContain("scope-package-missing");
  });

  it("deprecated-no-rationale", () => {
    // Body without "deprecated" word.
    const fm = makeFm({ status: "deprecated" });
    const stripped = fm.replace(/placeholder body/g, "no rationale here");
    const { findings } = validateFile("TPL-20260510-99-x.md", stripped, CTX);
    expect(findingKinds(findings)).toContain("deprecated-no-rationale");
  });

  it("deprecated WITH rationale passes", () => {
    const fm = makeFm({ status: "deprecated" });
    const withReason = fm.replace(
      /placeholder body/g,
      "This perspective is **deprecated** because the underlying assumption changed.",
    );
    const { findings } = validateFile("TPL-20260510-99-x.md", withReason, CTX);
    expect(findingKinds(findings)).not.toContain("deprecated-no-rationale");
  });
});

// ---------------------------------------------------------------------------
// Cross-file: related_to dangling
// ---------------------------------------------------------------------------

describe("related_to dangling check", () => {
  it("flags refs to non-existent IDs", () => {
    const parsed: ParsedTpl[] = [
      {
        file: "TPL-20260510-01-x.md",
        body: "",
        fm: {
          id: "TPL-20260510-01",
          title: "x",
          status: "active",
          date: "2026-05-10",
          applicable_to: ["a"],
          discovered_from: [{ issue: "#1" }],
          related_to: ["TPL-20260510-99"], // dangling
          topic: "testing",
          scope: { packages: ["core"] },
        },
      },
    ];
    const findings = validateRelatedTo(parsed);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("related-to-dangling");
  });

  it("passes when refs resolve", () => {
    const parsed: ParsedTpl[] = [
      {
        file: "TPL-20260510-01-x.md",
        body: "",
        fm: {
          id: "TPL-20260510-01",
          title: "x",
          status: "active",
          date: "2026-05-10",
          applicable_to: ["a"],
          discovered_from: [{ issue: "#1" }],
          related_to: ["TPL-20260510-02"],
          topic: "testing",
          scope: { packages: ["core"] },
        },
      },
      {
        file: "TPL-20260510-02-y.md",
        body: "",
        fm: {
          id: "TPL-20260510-02",
          title: "y",
          status: "active",
          date: "2026-05-10",
          applicable_to: ["b"],
          discovered_from: [{ issue: "#2" }],
          topic: "testing",
          scope: { packages: ["core"] },
        },
      },
    ];
    expect(validateRelatedTo(parsed)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// README index check
// ---------------------------------------------------------------------------

describe("README index check", () => {
  it("flags missing rows", () => {
    const parsed: ParsedTpl[] = [
      {
        file: "TPL-20260510-01-x.md",
        body: "",
        fm: {
          id: "TPL-20260510-01",
          title: "x",
          status: "active",
          date: "2026-05-10",
          applicable_to: ["a"],
          discovered_from: [{ issue: "#1" }],
          topic: "testing",
          scope: { packages: ["core"] },
        },
      },
    ];
    const readme = "no index here";
    const { findings } = validateReadmeIndex(readme, parsed, "/dev/null");
    expect(findings.some((f) => f.kind === "readme-missing-row")).toBe(true);
  });

  it("ignores TPL-link markdown inside fenced code blocks", () => {
    // Example output rendered in README explanations should not be parsed as
    // index rows pointing at missing files.
    const readme = [
      "# normal section",
      "[TPL-20260510-01](TPL-20260510-01-x.md)",
      "",
      "```",
      "$ pnpm tpl:related app-ui",
      "- [TPL-99999999-99](docs/test-perspectives/TPL-99999999-99-fake.md) — example output",
      "```",
    ].join("\n");
    const parsed: ParsedTpl[] = [];
    const { findings, rowIds } = validateReadmeIndex(readme, parsed, "/tmp");
    expect([...rowIds]).toEqual(["TPL-20260510-01"]);
    // No "row points to missing" findings for the fake link inside the code block:
    expect(findings.filter((f) => f.kind === "readme-row-points-to-missing-file")).toHaveLength(1); // the real TPL-20260510-01 link is dangling against /tmp
  });

  it("flags rows that point to missing files", () => {
    const readme = "[TPL-20260510-99](TPL-20260510-99-missing.md)";
    const { findings } = validateReadmeIndex(readme, [], TPL_DIR);
    expect(findings.some((f) => f.kind === "readme-row-points-to-missing-file")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns null fm when no frontmatter delimiters", () => {
    const r = parseFrontmatter("just body");
    expect(r.fm).toBeNull();
    expect(r.body).toBe("just body");
    expect(r.error).toBeNull();
  });

  it("parses a simple frontmatter block", () => {
    const r = parseFrontmatter("---\nid: TPL-20260510-01\n---\nbody\n");
    expect((r.fm as { id?: string }).id).toBe("TPL-20260510-01");
    expect(r.body).toBe("body\n");
    expect(r.error).toBeNull();
  });
});
