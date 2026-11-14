import { describe, it, expect } from "vitest";
import { APIError, APIConnectionError } from "@anthropic-ai/sdk";
import { makeErrorMessage } from "./errors.js";

// TPL-2379: the failure record keeps the API's fixed-vocabulary `error.type`
// and drops only prose. `makeErrorMessage` is the single place a failed chat
// call becomes an ErrorChatMessage, so every catch block inherits this.

const t = (key: string) => key;

function apiError(status: number, type: unknown): APIError {
  return APIError.generate(
    status,
    { type: "error", error: { type, message: "Overloaded" } },
    undefined,
    new Headers(),
  );
}

describe("makeErrorMessage — fixed-vocabulary error type (TPL-2379)", () => {
  it.each([
    [529, "overloaded_error", "server"],
    [500, "api_error", "server"],
    [429, "rate_limit_error", "rate_limit"],
    [401, "authentication_error", "auth"],
    [400, "invalid_request_error", "server"],
  ] as const)("keeps %s %s alongside the %s class", (status, type, errorType) => {
    const msg = makeErrorMessage(apiError(status, type), t);
    expect(msg.errorType).toBe(errorType);
    expect(msg.apiErrorType).toBe(type);
  });

  it.each([
    ["prose", "The upstream proxy timed out while waiting for a response"],
    ["an HTML page", "<html><body>524</body></html>"],
    ["upper case", "Overloaded_Error"],
    ["a leading digit", "5xx_error"],
    ["over 40 characters", `a${"b".repeat(40)}`],
    ["an empty string", ""],
    ["a non-string", 42],
  ])("drops a type that is %s", (_label, type) => {
    const msg = makeErrorMessage(apiError(529, type), t);
    expect(msg.apiErrorType).toBeNull();
    expect(msg.errorType).toBe("server");
  });

  it("records no type for a failure that did not come from the API body", () => {
    expect(makeErrorMessage(new APIConnectionError({}), t).apiErrorType).toBeNull();
    expect(makeErrorMessage(new Error("boom"), t).apiErrorType).toBeNull();
  });
});
