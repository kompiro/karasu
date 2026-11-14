import { APIError } from "@anthropic-ai/sdk";
import type { ErrorChatMessage } from "./types.js";

type ErrorType = ErrorChatMessage["errorType"];

// Narrow signature that matches the `t` function returned from
// `useTranslation` for just the three `chat.error.*` keys. Declared here so
// errors.ts stays free of imports that would create a cycle with
// `useChatSession` / `i18n/index`.
type ChatErrorTranslator = (
  key: "chat.error.auth" | "chat.error.rateLimit" | "chat.error.server",
) => string;

// The API's fixed-vocabulary error type (`overloaded_error`, `rate_limit_error`, …).
// A value that does not have the shape of a type name is prose (a proxy or an
// edge in front of the API can put anything in the body), so it is dropped
// rather than recorded (TPL-2379).
const API_ERROR_TYPE_SHAPE = /^[a-z][a-z0-9_]{0,39}$/;

function apiErrorType(err: unknown): string | null {
  if (!(err instanceof APIError)) return null;
  const type: unknown = err.type;
  return typeof type === "string" && API_ERROR_TYPE_SHAPE.test(type) ? type : null;
}

function classifyError(err: unknown): ErrorType {
  if (err instanceof APIError) {
    if (err.status === 401) return "auth";
    if (err.status === 429) return "rate_limit";
    return "server";
  }
  return "server";
}

function errorMessage(errorType: ErrorType, t: ChatErrorTranslator): string {
  switch (errorType) {
    case "auth":
      return t("chat.error.auth");
    case "rate_limit":
      return t("chat.error.rateLimit");
    case "server":
      return t("chat.error.server");
  }
}

// Builds the ErrorChatMessage shown in the chat log for a failed API call.
// Shared by every catch block in useChatSession so the error shape and its
// translation stay in one place; callers decide whether to append or replace
// `messages`.
export function makeErrorMessage(
  err: unknown,
  t: ChatErrorTranslator,
  retryMessageId?: string,
): ErrorChatMessage {
  const errorType = classifyError(err);
  return {
    id: crypto.randomUUID(),
    role: "error",
    errorType,
    apiErrorType: apiErrorType(err),
    content: errorMessage(errorType, t),
    retryMessageId,
  };
}
