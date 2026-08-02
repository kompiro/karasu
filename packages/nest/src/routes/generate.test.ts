import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GitHubClient } from "../github/client.js";
import { markGenerated } from "../store/krs-cache.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import { MemoryKV } from "../testing/memory-kv.js";

const SHA = "a".repeat(40);
const pending: Promise<unknown>[] = [];
const ctx: NestExecutionContext = { waitUntil: (promise) => void pending.push(promise) };

afterEach(() => {
  vi.restoreAllMocks();
  pending.length = 0;
});

/** Every binding present, so a test failure is never "not configured". */
function configured(kv: MemoryKV): NestEnv {
  return {
    KRS_CACHE: kv,
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: "unused",
    LLM_API_KEY: "unused",
  };
}

/** Stub the installation lookup without going near the App JWT path. */
function installedAs(installationId: string | undefined): void {
  vi.spyOn(GitHubClient.prototype, "installationIdFor").mockResolvedValue(installationId);
}

const call = (method: string, path: string, env: NestEnv): Promise<Response> =>
  handleRequest(new Request(`https://nest.example${path}`, { method }), env, ctx);

describe("POST /<owner>/<repo>/generate", () => {
  it("accepts with 202 and a status location, never the model", async () => {
    // 12-19 minutes does not fit in an HTTP response.
    installedAs("42");
    // Let the detached run fail immediately; the response is what is asserted.
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockRejectedValue(new Error("stop"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await call("POST", "/kompiro/shop/generate", configured(new MemoryKV()));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "running" });
    expect(response.headers.get("Location")).toBe("https://nest.example/kompiro/shop/status");
    await Promise.allSettled(pending);
  });

  it("runs the work detached, so the response does not wait for it", async () => {
    installedAs("42");
    let resolveRun: (() => void) | undefined;
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockImplementation(
      () => new Promise((resolve) => (resolveRun = () => resolve(SHA))),
    );
    const response = await call("POST", "/kompiro/shop/generate", configured(new MemoryKV()));
    expect(response.status).toBe(202);
    // The run is still in flight and was handed to waitUntil.
    expect(pending).toHaveLength(1);
    resolveRun?.();
  });

  it("404s a repository no installation can read", async () => {
    // Not installed and not visible are the same answer on purpose: telling
    // them apart would disclose whether a private repository exists.
    installedAs(undefined);
    const response = await call("POST", "/kompiro/private/generate", configured(new MemoryKV()));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_installed");
  });

  it("does not start a second run while one is in flight", async () => {
    // Two clicks a second apart must not buy two fifteen-minute runs.
    installedAs("42");
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "running", sha: SHA, startedAt: "2026-08-02T12:00:00Z" },
    );
    const started = vi.spyOn(GitHubClient.prototype, "defaultBranchSha");

    const response = await call("POST", "/kompiro/shop/generate", configured(kv));
    expect(response.status).toBe(202);
    expect((await response.json()).sha).toBe(SHA);
    expect(started).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("400s a malformed repository name before any lookup", async () => {
    const looked = vi.spyOn(GitHubClient.prototype, "installationIdFor");
    const response = await call("POST", "/kompiro/not a repo/generate", configured(new MemoryKV()));
    expect(response.status).toBe(400);
    expect(looked).not.toHaveBeenCalled();
  });

  it("refuses rather than 500s when the LLM key is missing", async () => {
    installedAs("42");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = new MemoryKV();
    const response = await call("POST", "/kompiro/shop/generate", {
      KRS_CACHE: kv,
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "unused",
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("LLM_API_KEY");
  });

  it("405s a GET on the generate path rather than treating it as a repo", async () => {
    const response = await call("GET", "/kompiro/shop/generate", configured(new MemoryKV()));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});

describe("GET /<owner>/<repo>/status", () => {
  it("reports done from the published document, without an installation lookup", async () => {
    const kv = new MemoryKV();
    await new NestStore(kv).publish(
      { installationId: 42, owner: "kompiro", repo: "shop", sha: SHA },
      { krs: markGenerated("system Shop {}\n"), generatedAt: "2026-08-02T00:00:00Z" },
    );
    const looked = vi.spyOn(GitHubClient.prototype, "installationIdFor");

    const response = await call("GET", "/kompiro/shop/status", configured(kv));
    expect(await response.json()).toEqual({
      state: "done",
      sha: SHA,
      generatedAt: "2026-08-02T00:00:00Z",
      krs: "/kompiro/shop",
    });
    expect(looked).not.toHaveBeenCalled();
  });

  it("reports a run in flight", async () => {
    installedAs("42");
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "running", sha: SHA, startedAt: "2026-08-02T12:00:00Z" },
    );
    expect((await (await call("GET", "/kompiro/shop/status", configured(kv))).json()).state).toBe(
      "running",
    );
  });

  it("reports a failure with its recorded reason", async () => {
    installedAs("42");
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "failed", sha: SHA, startedAt: "2026-08-02T12:00:00Z", error: "survey: no JSON" },
    );
    const body = await (await call("GET", "/kompiro/shop/status", configured(kv))).json();
    expect(body).toMatchObject({ state: "failed", error: "survey: no JSON" });
  });

  it("distinguishes never-requested from not-installed", async () => {
    // A single 404 for both would leave a caller polling a URL that can never
    // change, with no way to tell which problem they have.
    installedAs("42");
    const neverAsked = await call("GET", "/kompiro/shop/status", configured(new MemoryKV()));
    expect(neverAsked.status).toBe(404);
    expect((await neverAsked.json()).state).toBe("never_requested");

    installedAs(undefined);
    const notInstalled = await call("GET", "/kompiro/other/status", configured(new MemoryKV()));
    expect(notInstalled.status).toBe(404);
    expect((await notInstalled.json()).state).toBe("not_installed");
  });
});
