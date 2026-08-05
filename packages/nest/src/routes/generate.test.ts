import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import type { GenerationDispatcher } from "../generate/dispatch.js";
import { GitHubClient } from "../github/client.js";
import { markGenerated } from "../store/krs-cache.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import { MemoryKV } from "../testing/memory-kv.js";

const SHA = "a".repeat(40);
const ctx: NestExecutionContext = { waitUntil: () => {} };

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Records dispatches and refuses what the real binding refuses.
 *
 * Both rules matter. Duplicate ids are rejected, which is what makes the
 * route's read-then-write race harmless. And the id's character set is
 * checked, because the platform rejects anything outside `[A-Za-z0-9_-]`
 * with `(instance.invalid_id)` -- a double that accepts any string let a `.`
 * ship, and the first real dispatch was the first thing to notice.
 */
function fakeWorkflow(): GenerationDispatcher & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    create({ id, params }) {
      const instanceId = id ?? `${params.owner}-${params.repo}`;
      if (!/^[A-Za-z0-9_-]+$/.test(instanceId) || instanceId.length > 64) {
        return Promise.reject(new Error("(instance.invalid_id) Instance has invalid id"));
      }
      if (created.includes(instanceId)) {
        return Promise.reject(new Error("instance already exists"));
      }
      created.push(instanceId);
      return Promise.resolve({ id: instanceId });
    },
  };
}

/** Every binding present, so a test failure is never "not configured". */
function configured(
  kv: MemoryKV,
  workflow = fakeWorkflow(),
): NestEnv & {
  GENERATE_WORKFLOW: GenerationDispatcher & { created: string[] };
} {
  return {
    KRS_CACHE: kv,
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: "unused",
    LLM_API_KEY: "unused",
    GENERATE_WORKFLOW: workflow,
  };
}

/** Stub the installation lookup without going near the App JWT path. */
function installedAs(installationId: string | undefined): void {
  vi.spyOn(GitHubClient.prototype, "installationIdFor").mockResolvedValue(installationId);
}

const call = (method: string, path: string, env: NestEnv): Promise<Response> =>
  handleRequest(new Request(`https://nest.example${path}`, { method }), env, ctx);

describe("POST /<owner>/<repo>/generate", () => {
  it("hands the work to a Workflow and answers 202 with a status location", async () => {
    // Not `ctx.waitUntil`: that extends the request by about 30 seconds past a
    // response this route sends immediately, and a run takes 12-19 minutes.
    installedAs("42");
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
    const env = configured(new MemoryKV());

    const response = await call("POST", "/kompiro/shop/generate", env);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "running", sha: SHA });
    expect(response.headers.get("Location")).toBe("https://nest.example/kompiro/shop/status");
    expect(env.GENERATE_WORKFLOW.created).toHaveLength(1);
  });

  it("keys the Workflow instance on the commit, so a duplicate cannot start", async () => {
    // The in-flight check is a read-then-write; this is what makes a genuine
    // race harmless rather than doubling a service-paid inference bill.
    installedAs("42");
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
    const env = configured(new MemoryKV());

    const first = await call("POST", "/kompiro/shop/generate", env);
    const second = await call("POST", "/kompiro/shop/generate", env);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    // The loser gets the answer it wanted; only one run exists.
    expect(env.GENERATE_WORKFLOW.created).toEqual([`42-kompiro-shop-${SHA.slice(0, 12)}`]);
  });

  it("404s a repository no installation can read", async () => {
    // Not installed and not visible are the same answer on purpose: telling
    // them apart would disclose whether a private repository exists.
    installedAs(undefined);
    const response = await call("POST", "/kompiro/private/generate", configured(new MemoryKV()));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_installed");
  });

  it("does not dispatch while a fresh run is recorded", async () => {
    installedAs("42");
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "running", sha: SHA, startedAt: new Date().toISOString() },
    );
    const env = configured(kv);
    const resolved = vi.spyOn(GitHubClient.prototype, "defaultBranchSha");

    const response = await call("POST", "/kompiro/shop/generate", env);
    expect(response.status).toBe(202);
    expect(env.GENERATE_WORKFLOW.created).toEqual([]);
    expect(resolved).not.toHaveBeenCalled();
  });

  it("retries past a run that went stale", async () => {
    // A run killed by the platform leaves `running` behind. Refusing every
    // retry for a day on behalf of a job that is not executing is worse than
    // starting another one.
    installedAs("42");
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "running", sha: SHA, startedAt: "2020-01-01T00:00:00Z" },
    );
    const env = configured(kv);

    expect((await call("POST", "/kompiro/shop/generate", env)).status).toBe(202);
    expect(env.GENERATE_WORKFLOW.created).toHaveLength(1);
  });

  it("400s a malformed repository name before any lookup", async () => {
    const looked = vi.spyOn(GitHubClient.prototype, "installationIdFor");
    const response = await call("POST", "/kompiro/not a repo/generate", configured(new MemoryKV()));
    expect(response.status).toBe(400);
    expect(looked).not.toHaveBeenCalled();
  });

  it("refuses rather than 500s when the Workflow binding is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call("POST", "/kompiro/shop/generate", {
      KRS_CACHE: new MemoryKV(),
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "unused",
      LLM_API_KEY: "unused",
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("GENERATE_WORKFLOW");
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
      // Relative to now, not a fixed date: a pinned timestamp turns into a
      // stale record once the wall clock passes it by 90 minutes, and the test
      // starts failing on a day nobody changed anything.
      { state: "running", sha: SHA, startedAt: new Date().toISOString() },
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

  it("reports a stale run as failed rather than as still going", async () => {
    installedAs("42");
    const kv = new MemoryKV();
    await new RunStatusStore(kv).put(
      { installationId: "42", owner: "kompiro", repo: "shop" },
      { state: "running", sha: SHA, startedAt: "2020-01-01T00:00:00Z" },
    );
    const body = await (await call("GET", "/kompiro/shop/status", configured(kv))).json();
    expect(body).toMatchObject({ state: "failed", error: "the run stopped without finishing" });
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
