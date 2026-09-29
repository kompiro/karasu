import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { AccountStore } from "../store/accounts.js";
import { SessionStore } from "../store/sessions.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from "../auth/session.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };
const ORIGIN = "https://nest.example";

function env(kv = new MemoryKV()): NestEnv & { NEST_STORE: MemoryKV } {
  return {
    NEST_STORE: kv,
    GITHUB_OAUTH_CLIENT_ID: "Iv1.client",
    GITHUB_OAUTH_CLIENT_SECRET: "shhh",
    NEST_PUBLIC_ORIGIN: ORIGIN,
    NEST_SIGN_IN_ALLOWLIST: "42",
  };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** GitHub answering the token exchange and then `GET /user`. */
function stubGitHub(user: { id: number; login: string } = { id: 42, login: "kompiro" }): void {
  const queue = [jsonResponse({ access_token: "gho_token" }), jsonResponse(user)];
  vi.stubGlobal("fetch", () => Promise.resolve(queue.shift() ?? jsonResponse({}, 500)));
}

/** Every `Set-Cookie` on a response, since one response often sets two. */
const cookies = (response: Response): string[] => response.headers.getSetCookie();

const cookieNamed = (response: Response, name: string): string | undefined =>
  cookies(response).find((cookie) => cookie.startsWith(`${name}=`));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /auth/login", () => {
  it("redirects to GitHub and remembers the state it sent", async () => {
    const response = await handleRequest(new Request(`${ORIGIN}/auth/login`), env(), ctx);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("Location") as string);
    const state = location.searchParams.get("state");
    expect(location.host).toBe("github.com");
    expect(cookieNamed(response, OAUTH_STATE_COOKIE)).toContain(`=${state}`);
  });

  it("refuses to start when the deploy has no OAuth credentials", async () => {
    const response = await handleRequest(
      new Request(`${ORIGIN}/auth/login`),
      { NEST_STORE: new MemoryKV(), NEST_PUBLIC_ORIGIN: ORIGIN },
      ctx,
    );
    // A service that quietly degrades here would send people to a broken
    // consent screen rather than saying which binding is missing.
    expect(response.status).toBe(503);
  });

  it("refuses to start when the deploy has no sign-in allowlist", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { NEST_SIGN_IN_ALLOWLIST: _, ...withoutList } = env();
    const response = await handleRequest(new Request(`${ORIGIN}/auth/login`), withoutList, ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { message: "This deploy is missing the NEST_SIGN_IN_ALLOWLIST binding." },
    });
  });
});

describe("GET /auth/callback", () => {
  const callback = (query: string, cookie?: string, kv?: MemoryKV): Promise<Response> =>
    handleRequest(
      new Request(`${ORIGIN}/auth/callback${query}`, {
        headers: cookie === undefined ? {} : { Cookie: cookie },
      }),
      env(kv),
      ctx,
    );

  it("signs the submitter in and issues a session", async () => {
    stubGitHub();
    const kv = new MemoryKV();
    const response = await callback("?code=the-code&state=abc", `${OAUTH_STATE_COOKIE}=abc`, kv);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/console");

    const account = await new AccountStore(kv).get(42);
    expect(account?.login).toBe("kompiro");

    const session = cookieNamed(response, SESSION_COOKIE) as string;
    const [, value] = /^__Host-nest_session=([^;]+)/.exec(session) as RegExpExecArray;
    const [accountId, sessionId] = value.split(":");
    expect(accountId).toBe("42");
    expect(await new SessionStore(kv).get("42", sessionId as string)).toBeDefined();
  });

  it("clears the single-use state cookie once it has been spent", async () => {
    stubGitHub();
    const response = await callback("?code=c&state=abc", `${OAUTH_STATE_COOKIE}=abc`);
    expect(cookieNamed(response, OAUTH_STATE_COOKIE)).toContain("Max-Age=0");
  });

  it("refuses a state that does not match the cookie", async () => {
    // Without this an attacker can complete a sign-in of *their own* account
    // in a victim's browser, and the victim then submits under that handle.
    stubGitHub();
    const response = await callback("?code=c&state=theirs", `${OAUTH_STATE_COOKIE}=mine`);
    expect(response.status).toBe(400);
  });

  it("refuses a callback with no state cookie at all", async () => {
    stubGitHub();
    const response = await callback("?code=c&state=abc");
    expect(response.status).toBe(400);
  });

  it("clears the state cookie even when the attempt failed", async () => {
    // A single-use value left behind after a failure can be replayed into the
    // next attempt, which is what state was there to prevent.
    stubGitHub();
    const response = await callback("?code=c&state=theirs", `${OAUTH_STATE_COOKIE}=mine`);
    expect(cookieNamed(response, OAUTH_STATE_COOKIE)).toContain("Max-Age=0");
  });

  it("reads a declined consent screen as a decision, not a fault", async () => {
    const response = await callback("?error=access_denied&state=abc", `${OAUTH_STATE_COOKIE}=abc`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "declined" } });
  });

  it("keeps the provider's failure out of the response", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse({ error: "bad_verification_code", error_description: "leak" })),
    );
    const response = await callback("?code=stale&state=abc", `${OAUTH_STATE_COOKIE}=abc`);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("leak");
  });

  it("issues no session when GitHub does not say who signed in", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse({ error: "bad_verification_code" })));
    const kv = new MemoryKV();
    const response = await callback("?code=stale&state=abc", `${OAUTH_STATE_COOKIE}=abc`, kv);
    expect(cookieNamed(response, SESSION_COOKIE)).toBeUndefined();
    expect((await kv.list({ prefix: "sess/" })).keys).toEqual([]);
  });
});

describe("POST /auth/logout", () => {
  const logout = (kv: MemoryKV, cookie: string, origin: string | undefined = ORIGIN) =>
    handleRequest(
      new Request(`${ORIGIN}/auth/logout`, {
        method: "POST",
        headers: origin === undefined ? { Cookie: cookie } : { Cookie: cookie, Origin: origin },
      }),
      env(kv),
      ctx,
    );

  it("revokes the session and clears the cookie", async () => {
    const kv = new MemoryKV();
    const { sessionId } = await new SessionStore(kv).issue(42, "kompiro", new Date());
    const response = await logout(kv, `${SESSION_COOKIE}=42:${sessionId}`);
    expect(response.status).toBe(303);
    expect(cookieNamed(response, SESSION_COOKIE)).toContain("Max-Age=0");
    expect(await new SessionStore(kv).get(42, sessionId)).toBeUndefined();
  });

  it("refuses a request from another origin", async () => {
    const kv = new MemoryKV();
    const { sessionId } = await new SessionStore(kv).issue(42, "kompiro", new Date());
    const response = await logout(kv, `${SESSION_COOKIE}=42:${sessionId}`, "https://evil.example");
    expect(response.status).toBe(403);
    expect(await new SessionStore(kv).get(42, sessionId)).toBeDefined();
  });

  it("clears the cookie even when there was no session to revoke", async () => {
    const response = await logout(new MemoryKV(), `${SESSION_COOKIE}=42:nonsense`);
    expect(response.status).toBe(303);
    expect(cookieNamed(response, SESSION_COOKIE)).toContain("Max-Age=0");
  });
});

describe("the sign-in allowlist (#2969)", () => {
  const callbackWith = (allowlist: string | undefined, kv: MemoryKV): Promise<Response> =>
    handleRequest(
      new Request(`${ORIGIN}/auth/callback?code=c&state=abc`, {
        headers: { Cookie: `${OAUTH_STATE_COOKIE}=abc` },
      }),
      { ...env(kv), NEST_SIGN_IN_ALLOWLIST: allowlist },
      ctx,
    );

  it("refuses an account that is not on the list, and writes nothing about it", async () => {
    // The account record is the first personal data the gallery holds about
    // someone; #2691 has to be done before it holds any about non-operators.
    stubGitHub({ id: 7, login: "stranger" });
    const kv = new MemoryKV();
    const response = await callbackWith("42", kv);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "not_invited" } });
    expect(cookieNamed(response, SESSION_COOKIE)).toBeUndefined();
    expect(cookieNamed(response, OAUTH_STATE_COOKIE)).toContain("Max-Age=0");
    expect(await new AccountStore(kv).get(7)).toBeUndefined();
    expect((await kv.list()).keys).toEqual([]);
  });

  it("matches on the numeric id, not the login", async () => {
    // A login can be renamed and claimed by someone else; the id cannot.
    stubGitHub({ id: 7, login: "kompiro" });
    const response = await callbackWith("42", new MemoryKV());
    expect(response.status).toBe(403);
  });

  it("accepts any id on a list separated by commas or whitespace", async () => {
    stubGitHub({ id: 42, login: "kompiro" });
    const response = await callbackWith(" 1001,\n42  7 ", new MemoryKV());
    expect(response.status).toBe(303);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["only separators", " , "],
    ["a login instead of an id", "kompiro"],
    ["an id with a typo", "42,4x"],
    ["an id too large to hold exactly", "42,9007199254740993"],
  ])("fails closed when the list is %s", async (_, allowlist) => {
    // Neither "let everyone in" nor "quietly drop the bad entry": a typo that
    // dropped the operator would lock them out without saying why.
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubGitHub({ id: 42, login: "kompiro" });
    const kv = new MemoryKV();
    const response = await callbackWith(allowlist, kv);
    expect(response.status).toBe(503);
    expect((await kv.list()).keys).toEqual([]);
  });
});
