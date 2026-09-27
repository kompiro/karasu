import { describe, expect, it } from "vitest";
import {
  composeReleaseBody,
  composeReleaseTitle,
  extractChangelogSection,
  isReleaseTag,
  parsePackageTag,
  pickReleaseTagName,
  truncateSection,
} from "./github-release.mts";

// Fences the release record decided in #2939: one GitHub Release per release,
// tagged `release-YYYY-MM-DD`, built from the package tags on the commit.

describe("parsePackageTag", () => {
  it("splits a scoped package tag at the last @", () => {
    expect(parsePackageTag("@karasu-tools/core@0.3.0")).toEqual({
      name: "@karasu-tools/core",
      version: "0.3.0",
    });
    expect(parsePackageTag("karasu-vscode@0.2.0")).toEqual({
      name: "karasu-vscode",
      version: "0.2.0",
    });
  });

  it("ignores release tags, spec tags and packages that are not released", () => {
    expect(parsePackageTag("release-2026-09-27")).toBeNull();
    expect(parsePackageTag("krs-spec-v1.0")).toBeNull();
    expect(parsePackageTag("@karasu-tools/app@0.1.0")).toBeNull();
    expect(parsePackageTag("karasu@latest")).toBeNull();
  });
});

describe("isReleaseTag", () => {
  it("accepts the dated name and its same-day suffix only", () => {
    expect(isReleaseTag("release-2026-09-27")).toBe(true);
    expect(isReleaseTag("release-2026-06-25-3")).toBe(true);
    expect(isReleaseTag("release-0.7.0")).toBe(false);
    expect(isReleaseTag("v0.7.0")).toBe(false);
  });
});

describe("pickReleaseTagName", () => {
  it("uses the bare date for the first release of the day", () => {
    expect(pickReleaseTagName("2026-10-25", ["release-2026-09-27"])).toBe("release-2026-10-25");
  });

  it("suffixes a second and third release on the same day", () => {
    expect(pickReleaseTagName("2026-06-25", ["release-2026-06-25"])).toBe("release-2026-06-25-2");
    expect(pickReleaseTagName("2026-06-25", ["release-2026-06-25", "release-2026-06-25-2"])).toBe(
      "release-2026-06-25-3",
    );
  });
});

describe("extractChangelogSection", () => {
  const changelog = [
    "# karasu-vscode",
    "",
    "## 0.2.0",
    "",
    "### Minor Changes",
    "",
    "- new thing",
    "",
    "## 0.1.3",
    "",
    "### Patch Changes",
    "",
    "- fix",
    "",
  ].join("\n");

  it("returns the section of the version up to the next version heading", () => {
    expect(extractChangelogSection(changelog, "0.2.0")).toBe("### Minor Changes\n\n- new thing");
  });

  it("reads the last section to the end of the file", () => {
    expect(extractChangelogSection(changelog, "0.1.3")).toBe("### Patch Changes\n\n- fix");
  });

  it("does not match a version that is only a prefix of a heading", () => {
    expect(extractChangelogSection("## 0.1.30\n\n- x\n", "0.1.3")).toBeNull();
  });

  it("returns null for a version with no section", () => {
    expect(extractChangelogSection(changelog, "0.1.0")).toBeNull();
  });
});

describe("composeRelease", () => {
  const entries = [
    {
      name: "karasu-vscode",
      version: "0.2.0",
      changelogSection: "- ext",
      changelogUrl: "u/vscode",
    },
    { name: "karasu", version: "0.7.0", changelogSection: "- cli", changelogUrl: "u/cli" },
    {
      name: "@karasu-tools/core",
      version: "0.3.0",
      changelogSection: null,
      changelogUrl: "u/core",
    },
  ];

  it("lists packages in a fixed order regardless of tag order", () => {
    expect(composeReleaseTitle("2026-09-27", entries)).toBe(
      "2026-09-27: karasu 0.7.0, @karasu-tools/core 0.3.0, karasu-vscode 0.2.0",
    );
  });

  it("gives each package its own section and says when a CHANGELOG entry is missing", () => {
    const body = composeReleaseBody(entries);
    expect(body.indexOf("## karasu@0.7.0")).toBeLessThan(
      body.indexOf("## @karasu-tools/core@0.3.0"),
    );
    expect(body.indexOf("## @karasu-tools/core@0.3.0")).toBeLessThan(
      body.indexOf("## karasu-vscode@0.2.0"),
    );
    expect(body).toContain("## karasu@0.7.0\n\n- cli");
    expect(body).toMatch(/## @karasu-tools\/core@0\.3\.0\n\n_No CHANGELOG entry/);
  });
});

describe("release body budget", () => {
  // 40 changes of ~100 characters each, under one `### Minor Changes` heading.
  const change = (n: number) => `- change ${n}: ${"x".repeat(88)}\n  continued line`;
  const section = [
    "### Minor Changes",
    "",
    ...Array.from({ length: 40 }, (_, i) => change(i)),
  ].join("\n");

  it("leaves a section that fits untouched", () => {
    expect(truncateSection(section, section.length, "url")).toBe(section);
  });

  it("cuts between changes, never inside one, and links the full CHANGELOG", () => {
    const cut = truncateSection(section, 1500, "https://example/CHANGELOG.md");
    expect(cut.length).toBeLessThanOrEqual(1500);
    expect(cut.startsWith("### Minor Changes")).toBe(true);
    // Every kept change still carries its continuation line.
    const kept = cut.split("\n").filter((line) => line.startsWith("- ")).length;
    expect(cut.split("\n").filter((line) => line === "  continued line").length).toBe(kept);
    expect(cut).toMatch(
      new RegExp(
        `_…and ${40 - kept} more changes\\. The full list is in \\[CHANGELOG\\.md\\]\\(https://example/CHANGELOG\\.md\\)\\._$`,
      ),
    );
  });

  it("keeps the whole body under the budget and gives every package a share", () => {
    const entries = ["karasu", "@karasu-tools/core", "karasu-vscode"].map((name) => ({
      name,
      version: "1.0.0",
      changelogSection: section,
      changelogUrl: `u/${name}`,
    }));
    const body = composeReleaseBody(entries, 3000);
    expect(body.length).toBeLessThanOrEqual(3000);
    for (const name of ["karasu", "@karasu-tools/core", "karasu-vscode"]) {
      expect(body).toContain(`## ${name}@1.0.0`);
      expect(body).toContain(`[CHANGELOG.md](u/${name})`);
    }
  });

  it("hands a short package's unused share to the long ones", () => {
    const entries = [
      { name: "karasu", version: "1.0.0", changelogSection: section, changelogUrl: "u/cli" },
      {
        name: "karasu-vscode",
        version: "1.0.0",
        changelogSection: "- tiny",
        changelogUrl: "u/ext",
      },
    ];
    const body = composeReleaseBody(entries, 3000);
    expect(body.length).toBeLessThanOrEqual(3000);
    expect(body).toContain("## karasu-vscode@1.0.0\n\n- tiny");
    // More than an equal half of the budget went to the long section.
    expect(body.indexOf("## karasu-vscode@1.0.0")).toBeGreaterThan(1500);
  });

  it("does not truncate a body that fits", () => {
    const entries = [
      { name: "karasu", version: "1.0.0", changelogSection: section, changelogUrl: "u" },
    ];
    expect(composeReleaseBody(entries)).not.toContain("more change");
  });
});
