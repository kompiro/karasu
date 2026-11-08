import { describe, expect, it } from "vitest";
import type { Verdict } from "./low-pr-merger-flow.ts";
import { noticeFor, parseVerdicts } from "./low-pr-merger-notice.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";

const reject = (over: Partial<Extract<Verdict, { outcome: "reject" }>> = {}): Verdict => ({
  pr: 7,
  sha: SHA,
  outcome: "reject",
  reasons: ["tier"],
  details: ["PR #7 is labeled risk: low but its change is high"],
  ...over,
});
const wait = (stalled: boolean): Verdict => ({
  pr: 7,
  sha: SHA,
  outcome: "wait",
  reasons: ["checks-stuck"],
  details: [],
  stalled,
});

describe("noticeFor", () => {
  it("comments on a rejection with fixed text and a marker for the head", () => {
    const notice = noticeFor(reject(), []);
    expect(notice?.pr).toBe(7);
    expect(notice?.body).toContain(`<!-- low-pr-merger head=${SHA} reasons=tier -->`);
    expect(notice?.body).toContain("`tier.ts check` does not pass on this head");
    expect(notice?.body).toContain("at `0123456`");
  });

  it("never repeats what the PR wrote: details stay out of the comment (TPL-3673)", () => {
    const notice = noticeFor(reject({ details: ["@someone <img src=x> `rm -rf`"] }), []);
    expect(notice?.body).not.toContain("@someone");
    expect(notice?.body).not.toContain("<img");
  });

  it("names every reason, in a stable order", () => {
    const notice = noticeFor(reject({ reasons: ["tier", "conflict"] }), []);
    expect(notice?.body).toContain("reasons=conflict,tier -->");
    expect(notice?.body).toContain("conflicts with `main`");
  });

  it("comments on a wait only once it stalled", () => {
    expect(noticeFor(wait(false), [])).toBeNull();
    expect(noticeFor(wait(true), [])?.body).toContain("reasons=stalled -->");
  });

  it("says nothing to a PR it merges, leaves out, or could not decide", () => {
    const silent: Verdict[] = [
      { pr: 7, sha: SHA, outcome: "merge" },
      { pr: 7, sha: SHA, outcome: "out-of-scope", why: "draft" },
      { pr: 7, sha: SHA, outcome: "no-conclusion", details: ["HTTP 502"] },
    ];
    for (const v of silent) expect(noticeFor(v, [])).toBeNull();
  });

  it("says the same thing about the same head once", () => {
    const first = noticeFor(reject(), [])!;
    expect(noticeFor(reject(), ["unrelated", first.body])).toBeNull();
  });

  it("speaks again after a push, or when the reasons change", () => {
    const first = noticeFor(reject(), [])!;
    expect(noticeFor(reject({ sha: OTHER }), [first.body])).not.toBeNull();
    expect(noticeFor(reject({ reasons: ["tier", "conflict"] }), [first.body])).not.toBeNull();
  });
});

describe("parseVerdicts", () => {
  it("reads back what the judge wrote", () => {
    const verdicts: Verdict[] = [{ pr: 1, sha: SHA, outcome: "merge" }, reject()];
    expect(parseVerdicts(JSON.stringify(verdicts))).toEqual(verdicts);
  });

  it.each([
    ["not an array", "{}"],
    ["a PR number that is not a positive integer", `[{"pr":"7","sha":"${SHA}","outcome":"merge"}]`],
    ["a head that is not a full SHA", `[{"pr":7,"sha":"main","outcome":"merge"}]`],
    ["an unknown outcome", `[{"pr":7,"sha":"${SHA}","outcome":"approve"}]`],
    ["no output at all", ""],
  ])("refuses %s", (_, json) => {
    expect(() => parseVerdicts(json)).toThrow();
  });
});
