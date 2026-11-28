import { describe, expect, it } from "vitest";
import {
  type Finding,
  type GitFacts,
  parseRecord,
  recordSummary,
  renderRecord,
  severityOf,
  upsertRecord,
  verifyRecord,
} from "./local-review-record.ts";

const BASE = "b".repeat(40);
const HEAD = "a".repeat(40);
const FIX = "f".repeat(40);
const OLD_HEAD = "c".repeat(40);

/** A repository where HEAD descends from FIX and leaves the base at BASE. */
const facts = (over: Partial<GitFacts> = {}): GitFacts => ({
  headSha: HEAD,
  mergeBase: () => BASE,
  resolve: (rev) => [HEAD, FIX, OLD_HEAD].find((sha) => sha.startsWith(rev)) ?? null,
  isAncestor: (a, b) => a === b || (b === HEAD && (a === FIX || a === OLD_HEAD)),
  onlyBaseMerges: () => true,
  sameChange: () => true,
  ...over,
});

const finding = (f: Partial<Finding>): Finding => ({
  reviewer: "engineering",
  sev: "Major",
  where: "packages/core/src/x.ts:42",
  finding: "...",
  disposition: `fixed in ${FIX.slice(0, 7)}`,
  ...f,
});

const body = (
  findings: Finding[],
  extra: { head?: string; reviewers?: string; waived?: string } = {},
) =>
  `## Summary\n\nText.\n\n${renderRecord({
    base: BASE,
    head: extra.head ?? HEAD,
    reviewers:
      extra.reviewers ?? "/engineering:code-review (fresh subagent), coderabbit CLI --deep",
    waived: extra.waived,
    findings,
    verification: `pass 1 at ${HEAD}, files touched by fix commits, 0 new findings`,
  })}\n`;

const check = (b: string, tier: "low" | "design" | "medium" = "low", git = facts()) =>
  verifyRecord(parseRecord(b), tier, git);

describe("parseRecord / renderRecord", () => {
  it("reads back what it writes, pipes in a finding included", () => {
    const f = [finding({ finding: "a | b" }), finding({ sev: "Minor", disposition: "→ #3360" })];
    const parsed = parseRecord(body(f));
    expect("record" in parsed && parsed.record.findings).toEqual(f);
    expect("record" in parsed && parsed.record.head).toBe(HEAD);
  });

  it("is an error without a record, with two records, or with an unclosed one", () => {
    expect(parseRecord("no record here")).toHaveProperty("error");
    expect(parseRecord(body([]) + body([]))).toHaveProperty("error");
    expect(
      parseRecord(`<!-- local-review:v1 base=${BASE} head=${HEAD} -->\nReviewers: x`),
    ).toHaveProperty("error");
  });

  it("folds the record under the heading and keeps it readable (#3875)", () => {
    const b = body([finding({}), finding({ sev: "Minor", disposition: "declined: out of scope" })]);
    // Each part is present (indexOf would give -1) and comes after the one before.
    const parts = [
      "## Local review",
      "<details><summary>2 findings: 1 fixed, 1 declined</summary>",
      "Reviewers:",
      "| # | Reviewer |",
      "Verification:",
      "</details>",
      "<!-- /local-review -->",
    ];
    const at = parts.map((part) => b.indexOf(part));
    expect(at.filter((i) => i < 0)).toEqual([]);
    expect(at).toEqual([...at].sort((x, y) => x - y));
    // GitHub renders a table inside <details> only with a blank line before it.
    expect(b).toMatch(/<\/summary>\n\n/);
    expect(b).toMatch(/\n\n<\/details>\n\n<!-- \/local-review -->/);
  });

  it("keeps the author's text from breaking the fold, and reads it back (#3875)", () => {
    // Each of these broke the fold on GitHub: a bare tag, an unclosed tag, a code
    // span that a link, image or autolink takes apart, a code span across lines,
    // and a fence opened by a lone CR. The record's own marker inside a code span
    // cut the record short when read back.
    const hostile = [
      "</details> <details> <pre> <!-- & &lt; \\`",
      "[x](`)</details>` ![i](`)</details>` www.a.com/`</details>` https://a.com/`</details>`",
      "`<!-- /local-review -->` `<!-- local-review:v1 base=" + BASE + " head=" + HEAD + " -->`",
      "a lone CR\r```, U+2028\u2028and U+2029\u2029end, a trailing backtick `",
      "zero-width <\u200b already there",
    ].join(" | ");
    const r = {
      base: BASE,
      head: HEAD,
      reviewers: `coderabbit CLI --deep, ${hostile}`,
      waived: `\`</details>\` ${hostile}`,
      findings: [finding({ where: hostile, finding: hostile, disposition: "declined: <pre> x" })],
      verification: `checked ${hostile}\nsecond line`,
    };
    const block = renderRecord(r);
    // Between the fold's own tags, no `<` can start a tag, and no line was split.
    const inner = block.slice(
      block.indexOf("</summary>") + "</summary>".length,
      block.lastIndexOf("</details>"),
    );
    expect(inner).not.toMatch(/<[A-Za-z/!?]/);
    expect(inner).not.toMatch(/[\r\u2028\u2029]/);
    expect(block.match(/<!-- \/local-review -->/g)).toHaveLength(1);
    // The record reads back what it was given; a line ending becomes a space.
    const flat = (s: string) => s.replace(/\r\n|[\r\n\u2028\u2029]/g, " ");
    const parsed = parseRecord(block);
    expect("record" in parsed && parsed.record).toEqual({
      ...r,
      reviewers: flat(r.reviewers),
      waived: flat(r.waived),
      verification: flat(r.verification),
      findings: r.findings.map((f) => ({ ...f, where: flat(f.where), finding: flat(f.finding) })),
    });
  });

  it("reads the Reviewers line the same way through the guard (#3875)", () => {
    expect(
      check(
        body([finding({})], { reviewers: "coderabbit CLI skipped: <offline> & `x`" }),
        "medium",
      ),
    ).toEqual([]);
    // A lone CR no longer starts a `Waived:` line the author did not write.
    const cr = parseRecord(body([finding({})], { reviewers: "coderabbit CLI --deep\rWaived: no" }));
    expect("record" in cr && cr.record.waived).toBeUndefined();
    expect(
      check(
        body([finding({ disposition: "" })], { reviewers: "x\u2028coderabbit CLI --deep" }),
        "medium",
      ),
    ).toEqual([expect.stringContaining("finding 1 has no disposition")]);
  });

  it("reads a record written before the fold (#3875)", () => {
    const old = [
      `<!-- local-review:v1 base=${BASE} head=${HEAD} -->`,
      "",
      "## Local review",
      "",
      "Reviewers: r",
      "",
      "| # | Reviewer | Sev | Where | Finding | Disposition |",
      "| --- | --- | --- | --- | --- | --- |",
      "| 1 | engineering | Minor | a.ts | x | declined: y |",
      "<!-- /local-review -->",
    ].join("\n");
    const parsed = parseRecord(old);
    expect("record" in parsed && parsed.record.findings).toHaveLength(1);
  });

  it("summarises the folded record by disposition", () => {
    const r = { base: BASE, head: HEAD, reviewers: "r" };
    expect(recordSummary({ ...r, findings: [] })).toBe("No findings");
    expect(recordSummary({ ...r, findings: [], waived: "hand-made PR" })).toBe("Waived");
    expect(recordSummary({ ...r, findings: [finding({})] })).toBe("1 finding: 1 fixed");
    // The table turns a newline into a space, so the summary does too.
    expect(recordSummary({ ...r, findings: [finding({ disposition: "fixed in\nabcdef0" })] })).toBe(
      "1 finding: 1 fixed",
    );
    expect(
      recordSummary({
        ...r,
        findings: [
          finding({ disposition: "→ #3360" }),
          finding({ reviewer: "design", disposition: "no deviation" }),
          finding({ disposition: "" }),
        ],
      }),
    ).toBe("3 findings: 1 deferred, 1 no deviation, 1 open");
    // `no deviation` answers a design row only, as verifyRecord reads it.
    expect(recordSummary({ ...r, findings: [finding({ disposition: "no deviation" })] })).toBe(
      "1 finding: 1 open",
    );
  });

  it("upserts: replaces an existing record and appends when there is none", () => {
    const first = upsertRecord(
      "Body.",
      renderRecord({ base: BASE, head: OLD_HEAD, reviewers: "r", findings: [] }),
    );
    const second = upsertRecord(
      first,
      renderRecord({ base: BASE, head: HEAD, reviewers: "r", findings: [] }),
    );
    expect(second.match(/local-review:v1/g)).toHaveLength(1);
    expect(second).toContain(`head=${HEAD}`);
    expect(second.startsWith("Body.")).toBe(true);
  });
});

describe("severityOf", () => {
  it("reads the four names and treats anything else as Major (TPL-3286)", () => {
    expect(severityOf("Minor")).toBe("minor");
    expect(severityOf(" critical ")).toBe("critical");
    expect(severityOf("")).toBe("major");
    expect(severityOf("High")).toBe("major");
  });
});

describe("verifyRecord", () => {
  it("passes a fresh record whose findings were all fixed in the head", () => {
    expect(check(body([finding({})]))).toEqual([]);
  });

  it("fails a PR with no record", () => {
    expect(check("## Summary")).toHaveLength(1);
  });

  describe("freshness", () => {
    it("fails when the record's base is not where the PR leaves its base", () => {
      expect(check(body([]), "medium", facts({ mergeBase: () => "e".repeat(40) }))).toHaveLength(1);
    });

    it("passes an older head when only merges of main followed and the change is the same", () => {
      expect(check(body([], { head: OLD_HEAD }), "medium")).toEqual([]);
    });

    it("fails an older head when a non-merge commit followed", () => {
      expect(
        check(body([], { head: OLD_HEAD }), "medium", facts({ onlyBaseMerges: () => false })),
      ).toHaveLength(1);
    });

    it("fails an older head when the merge changed the PR's own lines", () => {
      expect(
        check(body([], { head: OLD_HEAD }), "medium", facts({ sameChange: () => false })),
      ).toHaveLength(1);
    });

    it("fails a head that is not a commit here", () => {
      expect(check(body([], { head: "d".repeat(40) }), "medium")).toHaveLength(1);
    });
  });

  describe("dispositions", () => {
    it("fails a finding without one", () => {
      expect(check(body([finding({ disposition: "" })]), "medium")).toHaveLength(1);
      expect(check(body([finding({ disposition: "will look later" })]), "medium")).toHaveLength(1);
    });

    it("fails a fix commit that is not in the record's head", () => {
      expect(check(body([finding({ disposition: "fixed in 1234567" })]), "medium")).toHaveLength(1);
    });

    it("accepts an Issue for a finding outside the diff", () => {
      expect(check(body([finding({ disposition: "→ #3360" })]))).toEqual([]);
      expect(check(body([finding({ disposition: "-> #3360" })]))).toEqual([]);
    });

    it("ignores CodeRabbit's own rows on Design (its advisory review)", () => {
      expect(check(body([finding({ reviewer: "CodeRabbit", disposition: "" })]), "design")).toEqual(
        [],
      );
    });

    it("checks CodeRabbit rows like any other on Low and Medium", () => {
      const declined = finding({
        reviewer: "CodeRabbit",
        sev: "Critical",
        disposition: "declined: nah",
      });
      expect(check(body([declined]))).toHaveLength(1);
      expect(
        check(body([finding({ reviewer: "coderabbit", disposition: "" })]), "medium"),
      ).toHaveLength(1);
    });

    it("accepts no deviation only on a design row (#3542)", () => {
      expect(check(body([finding({ reviewer: "design", disposition: "no deviation" })]))).toEqual(
        [],
      );
      expect(check(body([finding({ reviewer: "Design", disposition: "No deviation" })]))).toEqual(
        [],
      );
      expect(
        check(body([finding({ reviewer: "engineering", disposition: "no deviation" })])),
      ).toHaveLength(1);
      expect(
        check(body([finding({ reviewer: "design", disposition: "no deviation found" })])),
      ).toHaveLength(1);
    });

    it("fails a fix commit that is already on the base branch", () => {
      const onBase = facts({ isAncestor: (a, b) => a === FIX && (b === HEAD || b === BASE) });
      expect(check(body([finding({})]), "medium", onBase)).toHaveLength(1);
    });
  });

  describe("Low", () => {
    it("fails a declined Critical or Major, and a finding with no known severity", () => {
      expect(check(body([finding({ disposition: "declined: by design" })]))).toHaveLength(1);
      expect(
        check(body([finding({ sev: "Critical", disposition: "declined: by design" })])),
      ).toHaveLength(1);
      expect(check(body([finding({ sev: "?", disposition: "declined: by design" })]))).toHaveLength(
        1,
      );
    });

    it("passes a declined Minor or Trivial", () => {
      expect(check(body([finding({ sev: "Minor", disposition: "declined: style" })]))).toEqual([]);
      expect(check(body([finding({ sev: "Trivial", disposition: "declined: style" })]))).toEqual(
        [],
      );
    });

    it("passes a declined Major on Medium, where a human reads it", () => {
      expect(check(body([finding({ disposition: "declined: by design" })]), "medium")).toEqual([]);
    });

    it("fails a waived record and a skipped CLI run, which Medium passes", () => {
      const waived = body([], { waived: "hand-made PR" });
      const skipped = body([], {
        reviewers:
          "/engineering:code-review (fresh subagent), coderabbit CLI skipped: out of quota",
      });
      expect(check(waived)).toHaveLength(1);
      expect(check(skipped)).toHaveLength(1);
      expect(check(waived, "medium")).toEqual([]);
      expect(check(skipped, "medium")).toEqual([]);
    });
  });

  it("fails an empty waiver reason and a Reviewers line that names no CLI", () => {
    expect(check(body([], { waived: "" }), "medium")).toHaveLength(1);
    expect(check(body([], { reviewers: "/engineering:code-review" }), "medium")).toHaveLength(1);
  });
});
