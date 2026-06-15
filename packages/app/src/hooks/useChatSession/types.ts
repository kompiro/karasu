import type { PatchOperation } from "@karasu-tools/core";

export interface PatchProposal {
  toolUseId: string;
  operation: PatchOperation;
  targetNodeId?: string;
  content?: string;
  description: string;
  contentHashAtProposal: string;
}

export interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
}

export interface AssistantChatMessage {
  id: string;
  role: "assistant";
  content: string;
  patch?: PatchProposal;
  /** Set after the patch is resolved (applied or rejected) to keep history valid */
  patchResult?: string;
}

export interface ErrorChatMessage {
  id: string;
  role: "error";
  errorType: "auth" | "rate_limit" | "server";
  content: string;
  retryMessageId?: string;
}

export type ChatMessage = UserChatMessage | AssistantChatMessage | ErrorChatMessage;

export type SessionPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "pending_confirmation"; proposal: PatchProposal }
  | { kind: "awaiting_followup" };
