import { describe, expect, it } from "vitest";
import {
  composeReleaseBody,
  composeReleaseTitle,
  extractChangelogSection,
  isReleaseTag,
  parsePackageTag,
  pickReleaseTagName,
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
    { name: "karasu-vscode", version: "0.2.0", changelogSection: "- ext" },
    { name: "karasu", version: "0.7.0", changelogSection: "- cli" },
    { name: "@karasu-tools/core", version: "0.3.0", changelogSection: null },
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
