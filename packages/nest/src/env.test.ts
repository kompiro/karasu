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
    expect(requireBinding({ GITHUB_APP_ID: "42" }, "GITHUB_APP_ID")).toBe("42");
  });

  it("throws a named error when a binding is absent", () => {
    // Captured rather than asserted inside a `catch`, so the assertion runs
    // unconditionally even if the call stops throwing.
    const thrown = captureThrow(() => requireBinding({}, "GITHUB_APP_PRIVATE_KEY"));
    expect(thrown).toBeInstanceOf(MissingBindingError);
    expect((thrown as MissingBindingError).binding).toBe("GITHUB_APP_PRIVATE_KEY");
    expect((thrown as Error).message).toContain("GITHUB_APP_PRIVATE_KEY");
  });

  it("treats an empty string as absent", () => {
    // Wrangler surfaces an unset secret as "" in some configurations, and an
    // empty App key would otherwise reach the signing code as a valid value.
    expect(() => requireBinding({ GITHUB_APP_ID: "" }, "GITHUB_APP_ID")).toThrowError(
      MissingBindingError,
    );
  });
});
