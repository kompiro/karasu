import type Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./types.js";

export function buildApiMessages(history: ChatMessage[]): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];
  for (const msg of history) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      if (msg.patch) {
        content.push({
          type: "tool_use",
          id: msg.patch.toolUseId,
          name: "apply_krs_patch",
          input: {
            operation: msg.patch.operation,
            targetNodeId: msg.patch.targetNodeId,
            content: msg.patch.content,
            description: msg.patch.description,
          },
        });
      }
      if (content.length > 0) result.push({ role: "assistant", content });
      // If the tool_use was resolved, inject the tool_result as a user message so the
      // history remains valid (tool_use must always be followed by tool_result).
      if (msg.patch && msg.patchResult !== undefined) {
        result.push({
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: msg.patch.toolUseId, content: msg.patchResult },
          ],
        });
      }
    }
  }
  return result;
}
