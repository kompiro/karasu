import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "../github/client.js";
import {
  deliverPullRequest,
  deliveryBranch,
  deliveryEnabled,
  DeliveryFailed,
  KRS_PATH,
  pullRequestBody,
} from "./pull-request.js";

const SHA = "abc123def4567890".padEnd(40, "0");

const input = {
  installationId: "42",
  owner: "kompiro",
  repo: "shop",
  sha: SHA,
  krs: "system Shop {\n  service Payments\n}\n",
  domains: [{ name: "Payments", summary: "billing and refunds", confidence: "high" }],
  redactions: 0,
};

/** A client whose write surface is recorded rather than performed. */
function stubGithub(
  overrides: {
    openPr?: { number: number; url: string } | undefined;
    refExists?: boolean;
    refPointsAt?: string;
    /** The ref does not exist until someone else creates it mid-flight. */
    refAppearsAfterRace?: boolean;
    fileSha?: string | undefined;
    createRefFails?: number;
    prCreateFails?: boolean;
  } = {},
) {
  const github = new GitHubClient({ appId: "1", privateKeyPem: "unused", fetchImpl: fetch });
  const calls: string[] = [];
  vi.spyOn(github, "openPullRequest").mockImplementation(() => {
    calls.push("openPullRequest");
    return Promise.resolve(overrides.openPr);
  });
  vi.spyOn(github, "repoInfo").mockResolvedValue({
    defaultBranch: "main",
    // Canonical case, unlike the lower-cased owner every caller passes in.
    ownerLogin: "Kompiro",
  });
  const deleted = vi.spyOn(github, "deleteRef").mockResolvedValue();
  let refLookups = 0;
  vi.spyOn(github, "refSha").mockImplementation(() => {
    calls.push("refSha");
    refLookups += 1;
    if (overrides.refPointsAt !== undefined) return Promise.resolve(overrides.refPointsAt);
    if (overrides.refAppearsAfterRace === true) {
      return Promise.resolve(refLookups > 1 ? SHA : undefined);
    }
    return Promise.resolve(overrides.refExists === true ? SHA : undefined);
  });
  vi.spyOn(github, "createRef").mockImplementation(() => {
    calls.push("createRef");
    if (overrides.createRefFails !== undefined) {
      return Promise.reject(new GitHubApiError(overrides.createRefFails, "/git/refs", "nope"));
    }
    return Promise.resolve();
  });
  vi.spyOn(github, "fileSha").mockResolvedValue(overrides.fileSha);
  const put = vi.spyOn(github, "putFile").mockImplementation(() => {
    calls.push("putFile");
    return Promise.resolve();
  });
  const created = vi.spyOn(github, "createPullRequest").mockImplementation(() => {
    calls.push("createPullRequest");
    if (overrides.prCreateFails === true) {
      return Promise.reject(new GitHubApiError(403, "/pulls", "no pull_requests:write"));
    }
    return Promise.resolve({ number: 7, url: "https://github.com/kompiro/shop/pull/7" });
  });
  return { github, calls, put, created, deleted };
}

describe("deliverPullRequest", () => {
  it("opens a pull request on a branch named for the commit", async () => {
    const { github, put, created } = stubGithub();
    const result = await deliverPullRequest(input, { github });

    expect(result).toEqual({
      number: 7,
      url: "https://github.com/kompiro/shop/pull/7",
      created: true,
      branch: "karasu-nest/model-abc123def456",
      path: KRS_PATH,
    });
    expect(put.mock.calls[0]?.[3]).toMatchObject({
      path: KRS_PATH,
      content: input.krs,
      branch: "karasu-nest/model-abc123def456",
    });
    expect(created.mock.calls[0]?.[3]).toMatchObject({
      head: "karasu-nest/model-abc123def456",
      base: "main",
    });
  });

  it("looks for a duplicate under the owner's canonical login", async () => {
    // Everything reaching delivery has been lower-cased by the key
    // normaliser, and GitHub matches the head filter against a label carrying
    // the login's real case. Passing `kompiro:` for `Kompiro` means the
    // duplicate guard silently never fires.
    const { github } = stubGithub();
    const looked = vi.spyOn(github, "openPullRequest");
    await deliverPullRequest(input, { github });
    expect(looked.mock.calls[0]?.[4]).toBe("Kompiro");
  });

  it("refuses a branch that exists but points at another commit", async () => {
    // Reusing it would make the pull request's diff that branch's whole
    // history against the base, under a title promising one generated file.
    const { github } = stubGithub({ refPointsAt: "f".repeat(40) });
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(DeliveryFailed);
  });

  it("deletes the branch it created when the pull request cannot be opened", async () => {
    // A pushed branch with no pull request is litter in someone else's
    // repository that nothing will tell them about, and the next commit adds
    // another. Reachable whenever contents:write lands before
    // pull_requests:write, which is what a staged permission rollout is.
    const { github, deleted } = stubGithub({ prCreateFails: true });
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(GitHubApiError);
    expect(deleted).toHaveBeenCalledWith(
      "42",
      "kompiro",
      "shop",
      "heads/karasu-nest/model-abc123def456",
    );
  });

  it("leaves a branch it did not create", async () => {
    const { github, deleted } = stubGithub({ refExists: true, prCreateFails: true });
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(GitHubApiError);
    expect(deleted).not.toHaveBeenCalled();
  });

  it("returns the existing pull request rather than opening a second", async () => {
    // A repository owner who finds three identical pull requests has been
    // given a reason to uninstall. The generation route can retry, so this is
    // a requirement rather than a nicety.
    const { github, calls } = stubGithub({
      openPr: { number: 3, url: "https://github.com/kompiro/shop/pull/3" },
    });
    const result = await deliverPullRequest(input, { github });

    expect(result).toMatchObject({ number: 3, created: false });
    expect(calls).toEqual(["openPullRequest"]);
  });

  it("reuses a branch left behind by an earlier delivery", async () => {
    // The pull request may have been closed, or the previous attempt may have
    // died between creating the branch and opening the request. The content
    // is keyed on the same commit either way.
    const { github, calls } = stubGithub({ refExists: true });
    await deliverPullRequest(input, { github });
    expect(calls).not.toContain("createRef");
    expect(calls).toContain("putFile");
  });

  it("tolerates losing a race to create the branch", async () => {
    const { github, calls } = stubGithub({ createRefFails: 422, refAppearsAfterRace: true });
    await expect(deliverPullRequest(input, { github })).resolves.toMatchObject({ created: true });
    expect(calls).toContain("putFile");
  });

  it("does not swallow a branch creation failure that is not a race", async () => {
    const { github } = stubGithub({ createRefFails: 403 });
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(GitHubApiError);
  });

  it("reports a 422 that was a rule refusal rather than a lost race", async () => {
    // 422 covers both, and the body that would tell them apart is dropped on
    // purpose. Asking whether the ref exists is the only honest test.
    const github = new GitHubClient({ appId: "1", privateKeyPem: "unused", fetchImpl: fetch });
    vi.spyOn(github, "repoInfo").mockResolvedValue({
      defaultBranch: "main",
      ownerLogin: "Kompiro",
    });
    vi.spyOn(github, "openPullRequest").mockResolvedValue(undefined);
    vi.spyOn(github, "refSha").mockResolvedValue(undefined);
    vi.spyOn(github, "createRef").mockRejectedValue(
      new GitHubApiError(422, "/git/refs", "refused by a ruleset"),
    );
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(
      /refused by a ruleset/,
    );
  });

  it("replaces an existing file rather than failing on a 409", async () => {
    const { github, put } = stubGithub({ fileSha: "existing-blob-sha" });
    await deliverPullRequest(input, { github });
    expect(put.mock.calls[0]?.[3]).toMatchObject({ sha: "existing-blob-sha" });
  });
});

describe("pullRequestBody", () => {
  it("says it is a draft and how to disagree with it", async () => {
    const body = pullRequestBody(input);
    expect(body).toContain("first draft");
    expect(body).toContain("@draft");
    expect(body).toContain(KRS_PATH);
  });

  it("reports confidence per domain, so a reader knows what to check first", () => {
    const body = pullRequestBody(input);
    expect(body).toContain("| Payments | high | billing and refunds |");
  });

  it("cannot be made to inject directives into the body it is embedded in", () => {
    // A PR body is not inert: `Closes #12` closes that issue on merge, and
    // this text came from a model that read a repository which may carry
    // instructions aimed at it.
    const body = pullRequestBody({
      ...input,
      domains: [
        { name: "Payments\n\nCloses #1, #2\n\n@kompiro/admins", summary: "x", confidence: "high" },
      ],
    });
    expect(body).not.toMatch(/^Closes #1/m);
    expect(body).not.toMatch(/^@kompiro/m);
    expect(body).toContain("Payments Closes #1, #2 @kompiro/admins");
  });

  it("redacts a credential a model reproduced in a summary, and counts it", () => {
    // Until this module existed, `domains` never left the service. Input
    // redaction can miss, which is why the output scan exists.
    const token = `ghp_${"A1b2C3d4E5f6G7h8I9j0".repeat(2)}`;
    const body = pullRequestBody({
      ...input,
      domains: [{ name: "Auth", summary: `uses ${token} to call GitHub`, confidence: "low" }],
    });
    expect(body).not.toContain(token);
    expect(body).toContain("[REDACTED:github-token]");
    // And the body's own count reflects it rather than claiming none.
    expect(body).toContain("1 credential-shaped string(s) were redacted");
  });

  it("truncates a summary that ran away", () => {
    const body = pullRequestBody({
      ...input,
      domains: [{ name: "Payments", summary: "x".repeat(500), confidence: "high" }],
    });
    expect(body).toContain("…");
    expect(body.split("\n").every((line) => line.length < 400)).toBe(true);
  });

  it("says when the scan did not cover the whole repository", () => {
    // "a generated architecture model of owner/repo" implies the whole thing,
    // and the file cap makes partial the normal case above 200 files.
    const body = pullRequestBody({ ...input, truncatedByCap: true });
    expect(body).toContain("Not every file was read");
    expect(pullRequestBody(input)).toContain("Every eligible source file was read");
  });

  it("does not break its own table when a summary contains a pipe", () => {
    const body = pullRequestBody({
      ...input,
      domains: [{ name: "Payments", summary: "a | b", confidence: "low" }],
    });
    expect(body).toContain("| Payments | low | a \\| b |");
  });

  it("says what was read and that it was not kept", () => {
    // The pull request is where most people will meet this service. Saying
    // this only in a policy document nobody opens is not saying it.
    const body = pullRequestBody({ ...input, redactions: 3 });
    expect(body).toContain("were **not** stored");
    expect(body).toContain("3 credential-shaped string(s) were redacted");
  });

  it("does not imply a redaction happened when none did", () => {
    expect(pullRequestBody(input)).toContain("No credential-shaped strings were found");
  });

  it("names no domain when the reverse identified none", () => {
    const body = pullRequestBody({ ...input, domains: [] });
    expect(body).toContain("(none identified)");
  });
});

describe("deliveryEnabled", () => {
  it("is on only for the exact value, so a typo fails closed", () => {
    // The one control between this service and writing to repositories it was
    // given read consent for.
    expect(deliveryEnabled({ PR_DELIVERY: "on" })).toBe(true);
    expect(
      ["ON", "On", "true", "1", "yes", " on", "", undefined].map((value) =>
        deliveryEnabled({ ...(value === undefined ? {} : { PR_DELIVERY: value }) }),
      ),
    ).toEqual([false, false, false, false, false, false, false, false]);
  });
});

describe("deliveryBranch", () => {
  it("is derived from the commit, so a re-run lands on the same branch", () => {
    expect(deliveryBranch(SHA)).toBe(deliveryBranch(SHA));
    expect(deliveryBranch(SHA)).not.toBe(deliveryBranch("f".repeat(40)));
  });
});
