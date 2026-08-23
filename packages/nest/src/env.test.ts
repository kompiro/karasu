import { describe, expect, it } from "vitest";
import { MissingBindingError, requireBinding } from "./env.js";

function captureThrow(run: () => unknown): unknown {
  try {
    run();
  } catch (cause) {
    return cause;
  }
  return undefined;
}

describe("requireBinding", () => {
  it("returns a configured value", () => {
    expect(requireBinding({ GITHUB_OAUTH_CLIENT_ID: "Iv1.client" }, "GITHUB_OAUTH_CLIENT_ID")).toBe(
      "Iv1.client",
    );
  });

  it("throws a named error when a binding is absent", () => {
    // Captured rather than asserted inside a `catch`, so the assertion runs
    // unconditionally even if the call stops throwing.
    const thrown = captureThrow(() => requireBinding({}, "GITHUB_OAUTH_CLIENT_SECRET"));
    expect(thrown).toBeInstanceOf(MissingBindingError);
    expect((thrown as MissingBindingError).binding).toBe("GITHUB_OAUTH_CLIENT_SECRET");
    expect((thrown as Error).message).toContain("GITHUB_OAUTH_CLIENT_SECRET");
  });

  it("treats an empty string as absent", () => {
    // Wrangler surfaces an unset secret as "" in some configurations, and an
    // empty client secret would otherwise be posted to GitHub as a real one.
    expect(() =>
      requireBinding({ GITHUB_OAUTH_CLIENT_ID: "" }, "GITHUB_OAUTH_CLIENT_ID"),
    ).toThrowError(MissingBindingError);
  });
});
