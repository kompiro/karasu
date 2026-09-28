import { describe, expect, it } from "vitest";
import {
  appendFollowups,
  checkBody,
  checkIssueStates,
  closingReferences,
  extractSection,
  parseFollowups,
  referencedIssues,
} from "./post-merge-followups.mts";

// Fences the routing decided in #2957: a PR's post-merge follow-ups land on the
// Issue named by `Refs #N` in `## Purpose`, and a PR that would close that Issue
// on merge (or has none) cannot carry them.

const body = (purpose: string, followups: string): string =>
  [
    "## Purpose",
    "",
    "<!-- Link to related issue(s) -->",
    "<!-- e.g. Closes #12 -->",
    purpose,
    "",
    "## Summary",
    "",
    "Something changed. See #99 for context.",
    "",
    "## Manual Verification Checklist",
    "",
    "- [ ] The page renders on the preview",
    "",
    "## Post-merge follow-ups",
    "",
    "<!-- Use Refs #N, not Closes #N -->",
    followups,
    "",
    "## Related Docs",
    "",
    "- [ ] not a follow-up",
  ].join("\n");

describe("extractSection", () => {
  it("stops at the next second-level heading", () => {
    expect(extractSection("## A\none\n### sub\ntwo\n## B\nthree", "A")).toBe("one\n### sub\ntwo");
  });

  it("returns null for a missing section", () => {
    expect(extractSection("## A\none", "B")).toBeNull();
  });
});

describe("parseFollowups", () => {
  it("reads only the items under the follow-ups heading", () => {
    const items = parseFollowups(
      body("Refs #1", "- [ ] Next release tags the commit\n- [x] Backfill ran"),
    );
    expect(items).toEqual([
      { checked: false, text: "Next release tags the commit" },
      { checked: true, text: "Backfill ran" },
    ]);
  });

  it("treats N/A, the empty template box and a missing section as no items", () => {
    expect(parseFollowups(body("Closes #1", "N/A"))).toEqual([]);
    expect(parseFollowups(body("Closes #1", "- [ ]"))).toEqual([]);
    expect(parseFollowups("## Purpose\nCloses #1")).toEqual([]);
  });

  it("keeps an item's inline code verbatim", () => {
    expect(
      parseFollowups(
        body("Refs #1", "- [ ] Next `vscode-release.yml` run tags `karasu-vscode@X.Y.Z`"),
      ),
    ).toEqual([
      { checked: false, text: "Next `vscode-release.yml` run tags `karasu-vscode@X.Y.Z`" },
    ]);
  });

  it("ignores items inside the template's HTML comment", () => {
    expect(parseFollowups(body("Closes #1", "<!--\n- [ ] example item\n-->"))).toEqual([]);
  });
});

describe("issue references", () => {
  it("reads every closing keyword GitHub honours, outside comments and code", () => {
    expect(
      closingReferences("Fixes #3, resolves: #4\ncloses #5 `Closes #6`\n<!-- Closes #7 -->"),
    ).toEqual(["#3", "#4", "#5"]);
  });

  it("reads the owner/repo and URL forms GitHub also closes", () => {
    expect(
      closingReferences(
        "Closes kompiro/karasu#12\nFixes https://github.com/kompiro/karasu/issues/13",
      ),
    ).toEqual(["kompiro/karasu#12", "https://github.com/kompiro/karasu/issues/13"]);
  });

  it("takes the follow-up destination from Purpose only", () => {
    expect(referencedIssues(body("Refs #2957\nRefs #2939", "- [ ] x"))).toEqual([2957, 2939]);
    expect(referencedIssues("## Summary\nRefs #1")).toEqual([]);
  });
});

describe("checkBody", () => {
  it("accepts a PR without follow-ups whatever it links", () => {
    expect(checkBody(body("Closes #1", "N/A"))).toEqual([]);
    expect(checkBody(body("No Issue", "N/A"))).toEqual([]);
  });

  it("accepts follow-ups routed to an open Issue", () => {
    expect(checkBody(body("Refs #1", "- [ ] Next release"))).toEqual([]);
  });

  it("rejects follow-ups with nowhere to go", () => {
    const errors = checkBody(body("No Issue", "- [ ] Next release"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Refs #N");
  });

  it("rejects follow-ups on a PR that closes an Issue by URL", () => {
    const errors = checkBody(
      body("Refs #1", "- [ ] Next release") + "\nFixes https://github.com/kompiro/karasu/issues/1",
    );
    expect(errors).toHaveLength(1);
  });

  it("rejects follow-ups on a PR that closes an Issue on merge", () => {
    const errors = checkBody(body("Refs #1\nCloses #2", "- [ ] Next release"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("#2");
  });
});

describe("checkIssueStates", () => {
  it("accepts an open Issue", () => {
    expect(checkIssueStates(new Map([[1, { state: "open", isPullRequest: false }]]))).toEqual([]);
  });

  it("rejects a closed Issue, a pull request and a missing number", () => {
    const errors = checkIssueStates(
      new Map([
        [1, { state: "closed", isPullRequest: false }],
        [2, { state: "open", isPullRequest: true }],
        [3, null],
      ]),
    );
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('"Refs #1" is closed');
    expect(errors[1]).toContain('"Refs #2" is a pull request');
    expect(errors[2]).toContain('"Refs #3" names no Issue');
  });
});

describe("appendFollowups", () => {
  const items = [
    { checked: false, text: "Next release tags the commit" },
    { checked: true, text: "Backfill ran" },
  ];

  it("appends a block per PR, keeping each item's state", () => {
    expect(appendFollowups("Problem.\n\n", 42, items)).toBe(
      [
        "Problem.",
        "",
        "## Post-merge follow-ups from #42",
        "",
        "<!-- post-merge-followups #42 -->",
        "- [ ] Next release tags the commit",
        "- [x] Backfill ran",
        "",
      ].join("\n"),
    );
  });

  it("is a no-op on re-run, and a second PR adds its own block", () => {
    const once = appendFollowups("Problem.", 42, items) ?? "";
    expect(appendFollowups(once, 42, items)).toBeNull();
    expect(appendFollowups(once, 43, items)).toContain("## Post-merge follow-ups from #43");
  });

  it("appends nothing when there are no items", () => {
    expect(appendFollowups("Problem.", 42, [])).toBeNull();
  });
});
