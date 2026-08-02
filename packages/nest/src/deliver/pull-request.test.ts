import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "../github/client.js";
import { deliverPullRequest, deliveryBranch, KRS_PATH, pullRequestBody } from "./pull-request.js";

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
    fileSha?: string | undefined;
    createRefFails?: number;
  } = {},
) {
  const github = new GitHubClient({ appId: "1", privateKeyPem: "unused", fetchImpl: fetch });
  const calls: string[] = [];
  vi.spyOn(github, "openPullRequest").mockImplementation(() => {
    calls.push("openPullRequest");
    return Promise.resolve(overrides.openPr);
  });
  vi.spyOn(github, "defaultBranch").mockResolvedValue("main");
  vi.spyOn(github, "refSha").mockImplementation(() => {
    calls.push("refSha");
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
    return Promise.resolve({ number: 7, url: "https://github.com/kompiro/shop/pull/7" });
  });
  return { github, calls, put, created };
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
    const { github, calls } = stubGithub({ createRefFails: 422 });
    await expect(deliverPullRequest(input, { github })).resolves.toMatchObject({ created: true });
    expect(calls).toContain("putFile");
  });

  it("does not swallow a branch creation failure that is not a race", async () => {
    const { github } = stubGithub({ createRefFails: 403 });
    await expect(deliverPullRequest(input, { github })).rejects.toThrowError(GitHubApiError);
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

describe("deliveryBranch", () => {
  it("is derived from the commit, so a re-run lands on the same branch", () => {
    expect(deliveryBranch(SHA)).toBe(deliveryBranch(SHA));
    expect(deliveryBranch(SHA)).not.toBe(deliveryBranch("f".repeat(40)));
  });
});
