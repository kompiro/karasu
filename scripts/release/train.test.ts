import { describe, expect, it } from "vitest";
import {
  branchFromIssueBody,
  bumpedPackages,
  composeCommitSubject,
  composeTrainIssueBody,
  marketplaceStatus,
  shouldDepart,
} from "./train.mts";

// Fences the monthly release train decided in #2922 (docs/design/monthly-release-train.md).

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
