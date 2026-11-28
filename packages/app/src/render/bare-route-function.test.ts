import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@karasu-tools/i18n";
import { onRequest } from "../../../../functions/[[path]].js";
import { resolveRepoPermalink, type ResolveStatus } from "./repo-permalink.js";
import { RESERVED_TOP_SEGMENTS } from "../routes.js";

// The bare-permalink catch-all (`functions/[[path]].ts`), driven as Pages runs
// it: a request, `context.next()` for "hand it back to the SPA", the zone cache
// and the global `fetch` the resolver reaches GitHub raw with (TPL-1961).
//
// The routing decisions live in `bare-route.ts` and have their own unit tests;
// this file checks the properties of the Function as a whole, so a Function
// that stops calling the guard, or decides a status on its own, is caught too.

declare global {
  // The Workers zone cache the Function reads (`functions/_lib/workers.d.ts`).
  interface CacheStorage {
    readonly default: Cache;
  }
}

const ORIGIN = "https://karasu.example";

const SMALL_KRS = `system Shop {
  service Web { label "Web" }
}`;

/**
 * A model whose share payload is over the unfurl cap (the resolver answers 413).
 * The labels are pseudo-random so the payload's compression cannot shrink them.
 */
function oversizedKrs(): string {
  let seed = 1;
  const word = (length: number) =>
    Array.from({ length }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(97 + (seed % 26));
    }).join("");
  const lines = ["system Shop {"];
  for (let i = 0; i < 400; i++) lines.push(`  service Svc${i}${word(6)} { label "${word(24)}" }`);
  lines.push("}");
  return lines.join("\n");
}

type FetchFake = (url: string) => Promise<Response>;

interface Scenario {
  /** The path after the host, without a ref. */
  path: string;
  /** What GitHub raw answers. */
  github: FetchFake;
  /**
   * The same request asked again gives the same answer. Only a deterministic
   * answer may be handed back to the SPA or replaced with the signpost page, and
   * every deterministic answer that cost an upstream fetch must be cached.
   */
  deterministic: boolean;
}

const notFound: FetchFake = async () => new Response("Not Found", { status: 404 });

/**
 * One scenario per status the resolver can answer with. Keyed by the closed
 * `ResolveStatus` union, so a new status does not compile until it has a
 * scenario here and a decision about whether it is deterministic.
 */
const SCENARIOS: Record<ResolveStatus, Scenario> = {
  200: {
    path: "/o/r",
    github: async (url) => (url.endsWith("/index.krs") ? new Response(SMALL_KRS) : notFound(url)),
    deterministic: true,
  },
  // Parsed as `<owner>/<repo>` but never a permalink: the path does not end in `.krs`.
  400: { path: "/o/r/docs/intro", github: notFound, deterministic: true },
  404: { path: "/o/r", github: notFound, deterministic: true },
  413: {
    path: "/o/r",
    github: async (url) =>
      url.endsWith("/index.krs") ? new Response(oversizedKrs()) : notFound(url),
    deterministic: true,
  },
  500: {
    path: "/o/r",
    github: async () => {
      throw new TypeError("network down");
    },
    deterministic: false,
  },
  502: {
    path: "/o/r",
    github: async () => new Response("unavailable", { status: 503 }),
    deterministic: false,
  },
};

const STATUSES = Object.keys(SCENARIOS).map(Number) as ResolveStatus[];

interface Run {
  /** The Function's response, or "next" when it handed the request back. */
  response: Response | "next";
  fetched: number;
  cached: Response[];
}

let fetchFake: FetchFake;
let fetched: number;
let cached: Response[];
let cacheReads: number;
/** The zone cache's contents, keyed by request URL as the Cache API keys them. */
let store: Map<string, Response>;

beforeEach(() => {
  fetched = 0;
  cached = [];
  cacheReads = 0;
  store = new Map();
  fetchFake = notFound;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    fetched++;
    return fetchFake(String(input));
  });
  vi.stubGlobal("caches", {
    default: {
      match: async (request: Request) => {
        cacheReads++;
        return store.get(request.url)?.clone();
      },
      put: async (request: Request, response: Response) => {
        cached.push(response);
        store.set(request.url, response);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NEXT = new Response("spa");

function statusOf(response: Response | "next"): number | "next" {
  return response === "next" ? "next" : response.status;
}

function cacheControlOf(response: Response | "next"): string | null {
  return response === "next" ? null : response.headers.get("Cache-Control");
}

async function summary(response: Response | "next") {
  return response === "next" ? "next" : { status: response.status, body: await response.text() };
}

/** The Function declined the request: gave it back to the SPA, or answered with the signpost page. */
function declined(response: Response | "next"): boolean {
  return response === "next" || (response.headers.get("Content-Type") ?? "").includes("html");
}

async function run(pathname: string, method = "GET"): Promise<Run> {
  const pending: Promise<unknown>[] = [];
  const response = await onRequest({
    request: new Request(`${ORIGIN}${pathname}`, { method }),
    params: { path: pathname.split("/").filter(Boolean) },
    next: async () => NEXT,
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
  return { response: response === NEXT ? "next" : response, fetched, cached };
}

describe.each(STATUSES)("a path the resolver answers %i for", (status) => {
  const scenario = SCENARIOS[status];

  it("is the status the scenario is keyed by", async () => {
    // Keeps the table honest: each row really reaches its status.
    const result = await resolveRepoPermalink(scenario.path.slice(1), async (input) =>
      scenario.github(String(input)),
    );
    expect(result.status).toBe(status);
  });

  describe.each([
    ["without a ref", ""],
    ["with a pinned ref", "@main"],
  ])("%s", (_label, ref) => {
    beforeEach(() => {
      fetchFake = scenario.github;
    });

    it("is handed back to the SPA or signposted only when the answer is deterministic", async () => {
      // TPL-1961: falling through on a transient failure would hide an outage
      // behind the SPA or a "no model here" page.
      const { response } = await run(`${scenario.path}${ref}`);
      expect(declined(response) && !scenario.deterministic).toBe(false);
      expect(scenario.deterministic || statusOf(response) === status).toBe(true);
      // A pinned ref says the visitor meant a permalink, so they get the answer.
      expect(ref !== "" && declined(response)).toBe(false);
    });

    it("caches every deterministic answer that cost an upstream fetch, and no transient one", async () => {
      // TPL-1961: without the cache, a crawler walking unknown paths turns into
      // repeated GitHub raw fetches.
      const result = await run(`${scenario.path}${ref}`);
      const fetchedUncached = result.fetched > 0 && result.cached.length === 0;
      expect(scenario.deterministic && fetchedUncached).toBe(false);
      expect(!scenario.deterministic && result.cached.length > 0).toBe(false);
      expect(scenario.deterministic || cacheControlOf(result.response) === "no-store").toBe(true);
    });

    it("answers the same request again from the cache when the answer is deterministic", async () => {
      // The put is half of it: the Function must also read the cache back, under
      // the same key, before it asks GitHub again.
      const first = await run(`${scenario.path}${ref}`);
      const before = first.fetched;
      const second = await run(`${scenario.path}${ref}`);
      const refetched = second.fetched - before;
      expect(scenario.deterministic && before > 0 && refetched > 0).toBe(false);
      expect(!scenario.deterministic && refetched === 0).toBe(false);
      expect(await summary(second.response)).toEqual(await summary(first.response));
    });
  });
});

describe("a model too large to link", () => {
  // TPL-2259: the resolver's own tests pin the 413 diagnostic; this checks the
  // Function hands that diagnostic to the visitor as it is, instead of a broken
  // link (a 414 from an over-long `/s?s=` redirect) or a body of its own.
  it.each([
    ["without a ref", ""],
    ["with a pinned ref", "@main"],
  ])("%s, answers 413 with the diagnostic naming the cause", async (_label, ref) => {
    const scenario = SCENARIOS[413];
    fetchFake = scenario.github;
    const { response } = await run(`/o/r${ref}`);
    if (response === "next") throw new Error("the Function handed an over-cap model to the SPA");

    expect(response.status).toBe(413);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const body = await response.text();

    // The resolver's own answer for the same model: the Function must not
    // rebuild the message, change its numbers or add to it.
    const resolved = await resolveRepoPermalink(`o/r${ref}`, async (input) =>
      scenario.github(String(input)),
    );
    expect(body).toBe(resolved.message);

    // And that answer is the catalog's diagnostic: the cause, the encoded
    // length over the cap, and what to do. The cap is private to
    // `inline-share.ts`, so it is read back from the message, not pinned here.
    const source = `o/r@${ref === "" ? "HEAD" : "main"}`;
    const [, length, limit] = /encodes to (\d+) characters, over the (\d+) /.exec(body) ?? [];
    expect(Number(length)).toBeGreaterThan(Number(limit));
    expect(body).toBe(
      translate("en", "permalink.tooLarge.message", {
        source,
        length: Number(length),
        limit: Number(limit),
      }),
    );
  });
});

describe("another spelling of a permalink", () => {
  // The guard and the resolver see the normalised path, so a spelling the
  // browser or a link shortener produces is answered like the plain one
  // (TPL-1961). `%40` is the case that matters: read raw, `r%40main` is a repo
  // name that fails the charset and the pinned ref is silently lost.
  it.each([
    ["/o/r%40main", "/o/r@main"],
    ["/o/r/", "/o/r"],
    ["/o/%72", "/o/r"],
  ])("answers %s like %s", async (spelling, plain) => {
    fetchFake = notFound;
    expect(await summary((await run(spelling)).response)).toEqual(
      await summary((await run(plain)).response),
    );
  });
});

describe("a reserved top-level segment", () => {
  /** Spellings of `/<segment>/<rest>` the platform and the SPA treat as that path. */
  function spellings(segment: string): string[] {
    const encodedFirst = `%${segment.charCodeAt(0).toString(16).toUpperCase()}${segment.slice(1)}`;
    const encodedAll = [...segment]
      .map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
      .join("");
    return [
      `/${segment}/o/r`,
      `/${segment}/o/r/`,
      `/${segment}/o/r@main`,
      `/${encodedFirst}/o/r`,
      `/${encodedAll}/o/r`,
      `/${segment}%2Fo/r`,
    ];
  }

  // Every segment the route table reserves, in every spelling: a new reserved
  // segment joins automatically (TPL-1961). An encoded segment carries `%`,
  // which the owner charset already rejects, so these spellings are declined
  // even unnormalised; "another spelling of a permalink" above is what catches a
  // Function that stops decoding before the guard.
  describe.each([...RESERVED_TOP_SEGMENTS])("/%s", (segment) => {
    it.each(spellings(segment))("hands %s back without asking GitHub", async (pathname) => {
      fetchFake = async () => new Response(SMALL_KRS);
      const result = await run(pathname);
      expect(result.response).toBe("next");
      expect(result.fetched).toBe(0);
      expect(cacheReads).toBe(0);
    });
  });

  it("hands a non-GET request back without looking at the path", async () => {
    const result = await run("/o/r", "POST");
    expect(result.response).toBe("next");
    expect(result.fetched).toBe(0);
  });
});
