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

export function classifyError(err: unknown): ErrorType {
  if (err instanceof APIError) {
    if (err.status === 401) return "auth";
    if (err.status === 429) return "rate_limit";
    return "server";
  }
  return "server";
}

export function errorMessage(errorType: ErrorType, t: ChatErrorTranslator): string {
  switch (errorType) {
    case "auth":
      return t("chat.error.auth");
    case "rate_limit":
      return t("chat.error.rateLimit");
    case "server":
      return t("chat.error.server");
  }
}
