import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import type { GenerationDispatcher } from "../generate/dispatch.js";
import { GitHubClient } from "../github/client.js";
import { markGenerated } from "../store/krs-cache.js";
import { NestStore } from "../store/nest-store.js";
import { QuotaLedger } from "../quota/ledger.js";
import { LOCAL_REVERSE_GUIDE, MONTHLY_REVERSES } from "../quota/policy.js";
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
    expect(await response.json()).toEqual({
      state: "running",
      sha: SHA,
      quota: { used: 1, limit: 3 },
    });
    expect(response.headers.get("Location")).toBe("https://nest.example/kompiro/shop/status");
    expect(env.GENERATE_WORKFLOW.created).toHaveLength(1);
  });

  it("keys the Workflow instance on the commit, so a duplicate cannot start", async () => {
    // The in-flight check is a read-then-write; the instance id is what makes
    // a genuine race harmless rather than doubling a service-paid bill.
    installedAs("42");
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = configured(new MemoryKV());
    const instanceId = `42-kompiro-shop-${SHA.slice(0, 12)}`;

    const first = await call("POST", "/kompiro/shop/generate", env);
    // Clear the state that would legitimately short-circuit the second call,
    // so it reaches `create` and the platform's uniqueness is what stops it.
    await new QuotaLedger(env.KRS_CACHE as MemoryKV).releaseSlot("42", instanceId);
    const second = await call("POST", "/kompiro/shop/generate", env);

    expect(first.status).toBe(202);
    // 503, not 202: both benign duplicate paths are short-circuited earlier,
    // so reaching a rejected `create` means nothing started, and saying
    // "running" would leave the caller polling a run that does not exist.
    expect(second.status).toBe(503);
    expect(env.GENERATE_WORKFLOW.created).toEqual([instanceId]);
    // And the charge for the dispatch that did not happen went back.
    expect(await new QuotaLedger(env.KRS_CACHE as MemoryKV).used("42", new Date())).toBe(1);
  });

  it("serves an already-generated commit from the cache without charging", async () => {
    // ADR-1994 says a same-SHA re-request does not consume quota. Polling by
    // re-POSTing is a plausible thing to do, and it must not spend a month's
    // allowance on an answer the cache already has.
    installedAs("42");
    vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
    const kv = new MemoryKV();
    await new NestStore(kv).publish(
      { installationId: 42, owner: "kompiro", repo: "shop", sha: SHA },
      { krs: markGenerated("system Shop {}\n"), generatedAt: "2026-08-02T00:00:00Z" },
    );
    const env = configured(kv);

    const response = await call("POST", "/kompiro/shop/generate", env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: "done",
      sha: SHA,
      generatedAt: "2026-08-02T00:00:00Z",
      krs: "/kompiro/shop",
    });
    expect(env.GENERATE_WORKFLOW.created).toEqual([]);
    expect(await new QuotaLedger(kv).used("42", new Date())).toBe(0);
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

  describe("the free-tier quota (#1994)", () => {
    it("refuses once the month's allowance is gone, and points somewhere useful", async () => {
      // A refusal with no alternative is a dead end. The alternative is real:
      // the same reverse runs locally with the caller's own key.
      installedAs("42");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      const ledger = new QuotaLedger(kv);
      for (let index = 0; index < MONTHLY_REVERSES; index += 1) {
        await ledger.charge("42", new Date());
      }
      const env = configured(kv);

      const response = await call("POST", "/kompiro/shop/generate", env);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe("quota_exhausted");
      expect(body.error.message).toContain(LOCAL_REVERSE_GUIDE);
      expect(body.quota).toMatchObject({ used: MONTHLY_REVERSES, limit: MONTHLY_REVERSES });
      expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(env.GENERATE_WORKFLOW.created).toEqual([]);
    });

    it("refuses while another generation is running, with a shorter wait", async () => {
      installedAs("42");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      await new QuotaLedger(kv).takeSlot("42", "someone-elses-run", Date.now());
      const env = configured(kv);

      const response = await call("POST", "/kompiro/shop/generate", env);
      expect(response.status).toBe(429);
      expect((await response.json()).error.code).toBe("busy");
      expect(response.headers.get("Retry-After")).toBe("300");
      expect(env.GENERATE_WORKFLOW.created).toEqual([]);
    });

    it("resolves the commit before checking quota, so a cached commit stays free", async () => {
      // The cheaper ordering would refuse before the SHA lookup, but then an
      // exhausted caller could not be told "you already have this one" -- and
      // being charged for a commit already in the cache is the worse failure.
      installedAs("42");
      const resolved = vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      await new QuotaLedger(kv).takeSlot("42", "someone-elses-run", Date.now());

      expect((await call("POST", "/kompiro/shop/generate", configured(kv))).status).toBe(429);
      expect(resolved).toHaveBeenCalled();
    });

    it("charges the installation when a run is dispatched", async () => {
      installedAs("42");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      await call("POST", "/kompiro/shop/generate", configured(kv));
      expect(await new QuotaLedger(kv).used("42", new Date())).toBe(1);
    });

    it("takes a concurrency slot when a run is dispatched", async () => {
      installedAs("42");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      await call("POST", "/kompiro/shop/generate", configured(kv));
      expect(await new QuotaLedger(kv).inFlight(Date.now())).toBe(1);
    });

    it("does not charge a caller who is only polling an existing run", async () => {
      // Re-POSTing is a plausible way to poll. Charging for it would burn a
      // month's allowance on a run the caller already has.
      installedAs("42");
      const kv = new MemoryKV();
      await new RunStatusStore(kv).put(
        { installationId: "42", owner: "kompiro", repo: "shop" },
        { state: "running", sha: SHA, startedAt: new Date().toISOString() },
      );
      await call("POST", "/kompiro/shop/generate", configured(kv));
      expect(await new QuotaLedger(kv).used("42", new Date())).toBe(0);
    });

    it("does not hold a concurrency slot for a dispatch that failed", async () => {
      // A slot taken before a failed `create` is a slot nobody owns: the
      // Workflow that would release it never started. With a deployment-wide
      // concurrency of one, that is the whole service stalled for 90 minutes
      // by a failed dispatch.
      installedAs("42");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const kv = new MemoryKV();
      const refusing: GenerationDispatcher & { created: string[] } = {
        created: [],
        create: () => Promise.reject(new Error("the platform said no")),
      };

      const response = await call("POST", "/kompiro/shop/generate", configured(kv, refusing));
      expect(response.status).toBe(503);
      expect(await new QuotaLedger(kv).inFlight(Date.now())).toBe(0);
      expect(await new QuotaLedger(kv).used("42", new Date())).toBe(0);
    });

    it("does not let one installation's usage refuse another", async () => {
      installedAs("99");
      vi.spyOn(GitHubClient.prototype, "defaultBranchSha").mockResolvedValue(SHA);
      const kv = new MemoryKV();
      const ledger = new QuotaLedger(kv);
      for (let index = 0; index < MONTHLY_REVERSES; index += 1) {
        await ledger.charge("42", new Date());
      }
      expect((await call("POST", "/kompiro/other/generate", configured(kv))).status).toBe(202);
    });
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
