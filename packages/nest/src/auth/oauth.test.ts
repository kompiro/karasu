import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, exchangeCode, fetchUser, OAuthError, redirectUri } from "./oauth.js";

const config = {
  clientId: "Iv1.client",
  clientSecret: "shhh",
  origin: "https://nest.example",
};

/** A `fetch` that answers each call from the queue, and records the requests. */
function stubFetch(responses: Response[]): { calls: Request[] } {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    return Promise.resolve(next);
  });
  return { calls };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorizeUrl", () => {
  it("sends the browser to GitHub with our callback and the state", () => {
    const url = new URL(authorizeUrl(config, "state-value"));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://nest.example/auth/callback");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("asks for no scopes, because identity is all the gallery uses", () => {
    // Anything wider would be asking for access with no use for it, on the one
    // screen where the ask is the whole story a submitter gets to read.
    expect(new URL(authorizeUrl(config, "s")).searchParams.get("scope")).toBe("");
  });

  it("derives the callback from the origin, so it is not configured twice", () => {
    expect(redirectUri("https://nest.example")).toBe("https://nest.example/auth/callback");
  });

  it("never puts the client secret in the URL", () => {
    expect(authorizeUrl(config, "s")).not.toContain("shhh");
  });
});

describe("exchangeCode", () => {
  it("returns the access token", async () => {
    stubFetch([jsonResponse({ access_token: "gho_token", token_type: "bearer" })]);
    expect(await exchangeCode(config, "the-code")).toBe("gho_token");
  });

  it("posts the code, the callback and the credentials as a form", async () => {
    const { calls } = stubFetch([jsonResponse({ access_token: "gho_token" })]);
    await exchangeCode(config, "the-code");
    const body = new URLSearchParams(await (calls[0] as Request).text());
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe("Iv1.client");
    expect(body.get("client_secret")).toBe("shhh");
    expect(body.get("redirect_uri")).toBe("https://nest.example/auth/callback");
  });

  it("treats a 200 carrying an error field as a failure", async () => {
    // GitHub answers a bad `code` with HTTP 200 and an `error` field, so the
    // status alone cannot tell success from failure on this endpoint.
    stubFetch([
      jsonResponse({
        error: "bad_verification_code",
        error_description: "The code passed is incorrect or expired.",
      }),
    ]);
    await expect(exchangeCode(config, "stale")).rejects.toThrow(OAuthError);
  });

  it("carries the provider's error type, which is a fixed vocabulary", async () => {
    stubFetch([jsonResponse({ error: "incorrect_client_credentials" })]);
    await expect(exchangeCode(config, "c")).rejects.toMatchObject({
      reason: "incorrect_client_credentials",
    });
  });

  it("keeps the provider's prose out of the error", async () => {
    // `error_description` is prose from a provider, which is the thing
    // `reverse/llm.ts` learned to keep off our own error surface.
    stubFetch([
      jsonResponse({ error: "bad_verification_code", error_description: "leak me somewhere" }),
    ]);
    const failure = await exchangeCode(config, "c").catch((cause: unknown) => cause);
    expect(String((failure as Error).message)).not.toContain("leak me somewhere");
  });

  it("drops an error type that is not shaped like one", async () => {
    stubFetch([jsonResponse({ error: "Something Went Wrong!!" }, 401)]);
    await expect(exchangeCode(config, "c")).rejects.toMatchObject({
      reason: "token endpoint returned 401",
    });
  });

  it("reports a body it cannot read rather than assuming success", async () => {
    stubFetch([new Response("<html>gateway</html>", { status: 502 })]);
    await expect(exchangeCode(config, "c")).rejects.toThrow(OAuthError);
  });

  it("refuses a success that carries no token", async () => {
    stubFetch([jsonResponse({ token_type: "bearer" })]);
    await expect(exchangeCode(config, "c")).rejects.toMatchObject({
      reason: "token endpoint returned no access token",
    });
  });
});

describe("fetchUser", () => {
  it("returns the numeric id and the login, and nothing else", async () => {
    stubFetch([jsonResponse({ id: 42, login: "kompiro", email: "someone@example.com" })]);
    expect(await fetchUser("gho_token")).toEqual({ id: 42, login: "kompiro" });
  });

  it("sends the token as a bearer credential", async () => {
    const { calls } = stubFetch([jsonResponse({ id: 42, login: "kompiro" })]);
    await fetchUser("gho_token");
    expect((calls[0] as Request).headers.get("Authorization")).toBe("Bearer gho_token");
  });

  it("leaves no unread body behind on an error", async () => {
    const body = new Response("nope", { status: 401 });
    stubFetch([body]);
    await expect(fetchUser("gho_token")).rejects.toThrow(OAuthError);
    expect(body.bodyUsed).toBe(true);
  });

  it("refuses a body without a usable id", async () => {
    for (const payload of [{ login: "kompiro" }, { id: "42", login: "kompiro" }, { id: 42 }]) {
      stubFetch([jsonResponse(payload)]);
      await expect(fetchUser("gho_token")).rejects.toThrow(OAuthError);
      vi.unstubAllGlobals();
    }
  });
});
