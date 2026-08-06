import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhook-signature.js";

const SECRET = "s3cret-webhook-secret";
const BODY = JSON.stringify({ action: "deleted", installation: { id: 42 } });

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body) as unknown as ArrayBuffer),
  );
  return `sha256=${[...mac].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a signature GitHub would have produced", async () => {
    expect(await verifyWebhookSignature(SECRET, await sign(SECRET, BODY), BODY)).toBe(true);
  });

  it("accepts an upper-case hex digest", async () => {
    const header = (await sign(SECRET, BODY)).toUpperCase().replace("SHA256=", "sha256=");
    expect(await verifyWebhookSignature(SECRET, header, BODY)).toBe(true);
  });

  it("rejects a body that changed by one byte", async () => {
    const header = await sign(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, header, `${BODY} `)).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    expect(await verifyWebhookSignature(SECRET, await sign("other", BODY), BODY)).toBe(false);
  });

  it("rejects a missing signature", async () => {
    expect(await verifyWebhookSignature(SECRET, null, BODY)).toBe(false);
  });

  it("rejects a signature with no algorithm prefix", async () => {
    const header = (await sign(SECRET, BODY)).slice("sha256=".length);
    expect(await verifyWebhookSignature(SECRET, header, BODY)).toBe(false);
  });

  it("rejects the sha1 form GitHub still sends alongside", async () => {
    // `X-Hub-Signature` (sha1) is deprecated and must not be accepted here by
    // accident just because it is present on the request.
    expect(await verifyWebhookSignature(SECRET, "sha1=abc", BODY)).toBe(false);
  });

  it("rejects a truncated or over-long digest without comparing it", async () => {
    const header = await sign(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, header.slice(0, -2), BODY)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, `${header}ab`, BODY)).toBe(false);
  });

  it("rejects a digest that is not hexadecimal", async () => {
    expect(await verifyWebhookSignature(SECRET, `sha256=${"z".repeat(64)}`, BODY)).toBe(false);
  });

  it("rejects an empty digest", async () => {
    expect(await verifyWebhookSignature(SECRET, "sha256=", BODY)).toBe(false);
  });

  it("is sensitive to key order, so a re-serialised body does not verify", async () => {
    // The reason the route verifies the raw text rather than a re-stringified
    // parse: these two documents are equal as JSON and different as bytes.
    const original = '{"a":1,"b":2}';
    const reserialised = JSON.stringify(JSON.parse('{"b":2,"a":1}'));
    const header = await sign(SECRET, original);
    expect(await verifyWebhookSignature(SECRET, header, original)).toBe(true);
    expect(await verifyWebhookSignature(SECRET, header, reserialised)).toBe(false);
  });

  it("verifies a body with multi-byte characters", async () => {
    const body = JSON.stringify({ repository: { full_name: "鴉/karasu" } });
    expect(await verifyWebhookSignature(SECRET, await sign(SECRET, body), body)).toBe(true);
  });
});
