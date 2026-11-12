import { describe, expect, it } from "vitest";
import {
  branchFromIssueBody,
  bumpedPackages,
  composeCommitSubject,
  composeTrainIssueBody,
  marketplaceStatus,
  npmTrainState,
  shouldDepart,
} from "./train.mts";

// Fences the monthly release train decided in #2922 (ADR-2922).

describe("shouldDepart", () => {
  it("departs on the last Sunday of the month", () => {
    expect(shouldDepart("schedule", new Date("2026-10-25T00:00:00Z"))).toBe(true);
    expect(shouldDepart("schedule", new Date("2026-11-29T00:00:00Z"))).toBe(true);
  });

  it("skips the other Sundays", () => {
    expect(shouldDepart("schedule", new Date("2026-10-18T00:00:00Z"))).toBe(false);
    expect(shouldDepart("schedule", new Date("2026-10-04T00:00:00Z"))).toBe(false);
  });

  it("handles a year boundary and a short month", () => {
    expect(shouldDepart("schedule", new Date("2026-12-27T00:00:00Z"))).toBe(true);
    expect(shouldDepart("schedule", new Date("2027-02-28T00:00:00Z"))).toBe(true);
    expect(shouldDepart("schedule", new Date("2027-02-21T00:00:00Z"))).toBe(false);
  });

  it("always departs on a manual dispatch", () => {
    expect(shouldDepart("workflow_dispatch", new Date("2026-10-18T00:00:00Z"))).toBe(true);
  });
});

describe("bumpedPackages", () => {
  const before = { karasu: "0.7.0", "@karasu-tools/core": "0.3.0", "karasu-vscode": "0.2.0" };

  it("lists only the packages whose version moved, in release order", () => {
    const after = { ...before, "karasu-vscode": "0.2.1", "@karasu-tools/core": "0.4.0" };
    expect(bumpedPackages(before, after)).toEqual([
      { name: "@karasu-tools/core", from: "0.3.0", to: "0.4.0" },
      { name: "karasu-vscode", from: "0.2.0", to: "0.2.1" },
    ]);
  });

  it("finds nothing to release when only unreleased packages moved", () => {
    expect(bumpedPackages(before, { ...before, "@karasu-tools/docs-site": "1.0.0" })).toEqual([]);
    expect(() => composeCommitSubject([])).toThrow(/nothing to release/);
  });

  it("names the release by its packages, not by the CLI version", () => {
    const after = { ...before, "karasu-vscode": "0.2.1" };
    expect(composeCommitSubject(bumpedPackages(before, after))).toBe(
      "chore: release karasu-vscode 0.2.1",
    );
  });
});

describe("tracking Issue", () => {
  const body = composeTrainIssueBody({
    repository: "kompiro/karasu",
    branch: "chore/release-2026-10-25",
    bumps: [{ name: "karasu", from: "0.7.0", to: "0.8.0" }],
    npmNames: ["karasu", "@karasu-tools/core", "karasu-skills"],
  });

  it("carries the branch so the close job can find it", () => {
    expect(branchFromIssueBody(body)).toBe("chore/release-2026-10-25");
  });

  it("links the compare view that opens the release PR", () => {
    expect(body).toContain(
      "https://github.com/kompiro/karasu/compare/main...chore/release-2026-10-25?expand=1",
    );
    expect(body).toContain("| `karasu` | 0.7.0 | 0.8.0 |");
  });

  it("asks for the stage-only connection and the approval when npm packages move (#3240)", () => {
    expect(body).toContain("stage-only Trusted Publisher connection");
    expect(body).toContain("conditioned on the environment `npm`");
    expect(body).toContain("- [ ] Approve the staged npm versions (`pnpm release:approve`)");
    expect(body.indexOf("Squash-merge")).toBeLessThan(body.indexOf("Approve the staged"));
    expect(body).toContain("`release-confirm.yml`");
  });

  it("leaves the npm steps out of a train that only moves the extension", () => {
    const vscodeOnly = composeTrainIssueBody({
      repository: "kompiro/karasu",
      branch: "chore/release-2026-10-25",
      bumps: [{ name: "karasu-vscode", from: "0.2.0", to: "0.2.1" }],
      npmNames: ["karasu", "@karasu-tools/core", "karasu-skills"],
    });
    expect(vscodeOnly).not.toContain("release:approve");
    expect(vscodeOnly).not.toContain("Trusted Publisher");
  });

  it("finds no branch in an unrelated Issue", () => {
    expect(branchFromIssueBody("Release branch: `feat/x`")).toBeNull();
    expect(branchFromIssueBody("nothing here")).toBeNull();
  });
});

describe("marketplaceStatus", () => {
  const show = {
    versions: [
      {
        version: "0.3.0",
        properties: [{ key: "Microsoft.VisualStudio.Code.PreRelease", value: "true" }],
      },
      {
        version: "0.2.0",
        properties: [{ key: "Microsoft.VisualStudio.Code.Engine", value: "^1.125.0" }],
      },
    ],
  };

  it("is stable when the version exists outside the pre-release channel", () => {
    expect(marketplaceStatus(show, "0.2.0")).toBe("stable");
  });

  it("is prerelease-only when the version exists only as a pre-release", () => {
    expect(marketplaceStatus(show, "0.3.0")).toBe("prerelease-only");
  });

  it("is absent for a new version", () => {
    expect(marketplaceStatus(show, "0.4.0")).toBe("absent");
    expect(marketplaceStatus({}, "0.4.0")).toBe("absent");
  });
});

describe("npmTrainState", () => {
  const bumped = [
    { name: "karasu-skills", version: "0.3.0" },
    { name: "karasu", version: "0.11.0" },
  ];

  it("is done when every bumped version is tagged on the release commit (#3240)", () => {
    expect(npmTrainState(bumped, () => "sha", "sha")).toEqual({ pending: [], misplaced: [] });
  });

  it("waits for untagged versions and reports tags on another commit", () => {
    const targets: Record<string, string> = { "karasu-skills@0.3.0": "other" };
    expect(npmTrainState(bumped, (tag) => targets[tag] ?? null, "sha")).toEqual({
      pending: ["karasu@0.11.0"],
      misplaced: ["karasu-skills@0.3.0"],
    });
  });

  it("has nothing to wait for when no npm package was bumped", () => {
    expect(npmTrainState([], () => null, "sha")).toEqual({ pending: [], misplaced: [] });
  });
});
