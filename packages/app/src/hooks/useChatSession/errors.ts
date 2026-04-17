import { APIError } from "@anthropic-ai/sdk";
import type { ErrorChatMessage } from "./types.js";

export function classifyError(err: unknown): ErrorChatMessage["errorType"] {
  if (err instanceof APIError) {
    if (err.status === 401) return "auth";
    if (err.status === 429) return "rate_limit";
    return "server";
  }
  return "server";
}

export function errorMessage(errorType: ErrorChatMessage["errorType"]): string {
  switch (errorType) {
    case "auth":
      return "⚠ APIキーが無効です。Settings で正しいキーを設定してください。";
    case "rate_limit":
      return "⚠ リクエスト制限に達しました。しばらく待ってから再試行してください。";
    case "server":
      return "⚠ Anthropic サーバーエラーです。しばらく待ってから再試行してください。";
  }
}
