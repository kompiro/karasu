import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { applyKrsPatch, type PatchOperation } from "../utils/krs-patch.js";
import type { SystemNode } from "@karasu-tools/core";
import { resolveLocale } from "../i18n/locale.js";
import { useTranslation } from "../i18n/index.js";
import {
  buildTools,
  buildSystemPrompt,
  hashContent,
  reviewTriggerMessage,
  interviewTriggerMessage,
} from "./useChatSession/prompt.js";
import { classifyError, errorMessage } from "./useChatSession/errors.js";
import { buildApiMessages } from "./useChatSession/apiMessages.js";
import type {
  ChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  ErrorChatMessage,
  PatchProposal,
  SessionPhase,
} from "./useChatSession/types.js";

export type { PatchProposal } from "./useChatSession/types.js";
export { detectDrillDownLevel } from "./useChatSession/prompt.js";

const MODEL = "claude-sonnet-4-6";

interface UseChatSessionParams {
  fileContent: string;
  currentFilePath: string | null;
  scopeLabel: string;
  viewPath: string[];
  resolvedSystems: SystemNode[];
  apiKey: string | null;
  onNavigateViewPath: (path: string[]) => void;
  onEditorChange: (value: string) => void;
  sessionResetKey: string | null;
}

// Controls how each call site handles tool_use blocks in the response, so that
// runTurn can preserve the (intentionally) different behaviors of the original
// five call sites without duplicating the client.messages.create plumbing.
interface RunTurnOptions {
  /**
   * - "followup"   : call onNavigateViewPath and issue one extra request so the
   *                  AI can produce the text that accompanies the navigation.
   * - "side_effect": call onNavigateViewPath but do not issue a follow-up.
   * - "ignore"     : silently drop navigate_view blocks (no side effect, no follow-up).
   */
  navigateMode?: "followup" | "side_effect" | "ignore";
  /** When false, apply_krs_patch blocks are silently dropped. */
  extractPatch?: boolean;
}

// Marks the assistant message that carried the tool_use as resolved (so the
// next buildApiMessages emits a matching tool_result) and optionally appends a
// follow-up assistant message with any text returned by the AI.
function markPatchResolved(
  prev: ChatMessage[],
  proposal: PatchProposal,
  patchResult: string,
  text: string,
): ChatMessage[] {
  const resolved = prev.map((m) =>
    m.role === "assistant" && m.patch?.toolUseId === proposal.toolUseId ? { ...m, patchResult } : m,
  );
  if (text) {
    return [...resolved, { id: crypto.randomUUID(), role: "assistant" as const, content: text }];
  }
  return resolved;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChatSession({
  fileContent,
  currentFilePath,
  scopeLabel,
  viewPath,
  resolvedSystems,
  apiKey,
  onNavigateViewPath,
  onEditorChange,
  sessionResetKey,
}: UseChatSessionParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<SessionPhase>({ kind: "idle" });

  // Resolve locale once when the hook initializes. Keeping it fixed for the
  // session's lifetime avoids the assistant's behavior drifting mid-conversation
  // if the user changes the stored locale in another tab. The UI selector
  // introduced by #34 will prompt a session reset when it changes the locale.
  const [locale] = useState(() => resolveLocale());
  const tools = useMemo(() => buildTools(locale), [locale]);

  // `t` is used to localize error messages surfaced in the chat log.
  // Keep the latest value in a ref so async callbacks pick up the current
  // locale's messages without extra re-subscribes.
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  // Keep a ref to the current phase so async callbacks can read the latest value
  const phaseRef = useRef<SessionPhase>(phase);
  phaseRef.current = phase;

  // Keep a ref to the latest apiKey / fileContent / currentFilePath / scopeLabel for use in callbacks
  const fileContentRef = useRef(fileContent);
  fileContentRef.current = fileContent;
  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;
  const scopeLabelRef = useRef(scopeLabel);
  scopeLabelRef.current = scopeLabel;
  const viewPathRef = useRef(viewPath);
  viewPathRef.current = viewPath;
  const resolvedSystemsRef = useRef(resolvedSystems);
  resolvedSystemsRef.current = resolvedSystems;
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const resetSession = useCallback(() => {
    setMessages([]);
    setPhase({ kind: "idle" });
  }, []);

  useEffect(() => {
    resetSession();
  }, [sessionResetKey, resetSession]);

  // ── Core turn ──────────────────────────────────────────────────────────────

  // Single turn of the Anthropic conversation: sends apiMessages, then collects
  // text, handles navigate_view / apply_krs_patch blocks per options, and
  // optionally issues a follow-up request for navigate_view text. Throws on
  // API errors — callers are responsible for translating exceptions into
  // ErrorChatMessages.
  const runTurn = useCallback(
    async (
      apiMessages: Anthropic.Messages.MessageParam[],
      options: RunTurnOptions = {},
    ): Promise<{ text: string; patchProposal?: PatchProposal }> => {
      const { navigateMode = "followup", extractPatch = true } = options;

      const key = apiKeyRef.current;
      if (!key) return { text: "" };

      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const system = buildSystemPrompt({
        scopeLabel: scopeLabelRef.current,
        viewPath: viewPathRef.current,
        fileContent: fileContentRef.current,
        currentFilePath: currentFilePathRef.current,
        resolvedSystems: resolvedSystemsRef.current,
        locale,
      });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        tools,
        messages: apiMessages,
      });

      let text = "";
      let patchProposal: PatchProposal | undefined;
      let navigateToolUseId: string | undefined;

      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          if (block.name === "navigate_view" && navigateMode !== "ignore") {
            const input = block.input as { path: string[] };
            onNavigateViewPath(input.path);
            if (navigateMode === "followup") navigateToolUseId = block.id;
          } else if (block.name === "apply_krs_patch" && extractPatch) {
            const input = block.input as {
              operation: PatchOperation;
              targetNodeId?: string;
              content?: string;
              description: string;
            };
            const hash = await hashContent(fileContentRef.current);
            patchProposal = {
              toolUseId: block.id,
              operation: input.operation,
              targetNodeId: input.targetNodeId,
              content: input.content,
              description: input.description,
              contentHashAtProposal: hash,
            };
          }
        }
      }

      if (navigateToolUseId) {
        const followupMessages: Anthropic.Messages.MessageParam[] = [
          ...apiMessages,
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: navigateToolUseId, content: "Navigated." },
            ],
          },
        ];
        const followup = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system,
          tools,
          messages: followupMessages,
        });
        for (const fb of followup.content) {
          if (fb.type === "text") text += fb.text;
        }
      }

      return { text, patchProposal };
    },
    [onNavigateViewPath, locale, tools],
  );

  // ── callApi ────────────────────────────────────────────────────────────────

  const callApi = useCallback(
    async (history: ChatMessage[], retryUserMsgId?: string): Promise<void> => {
      if (!apiKeyRef.current) return;
      const apiMessages = buildApiMessages(history);

      try {
        const { text, patchProposal } = await runTurn(apiMessages);

        const assistantMsg: AssistantChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text,
          patch: patchProposal,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (patchProposal) {
          setPhase({ kind: "pending_confirmation", proposal: patchProposal });
        } else {
          setPhase({ kind: "idle" });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[useChatSession] API error:",
          err instanceof APIError
            ? { status: err.status, message: err.message, error: err.error }
            : err,
        );
        const errorType = classifyError(err);
        const errorMsg: ErrorChatMessage = {
          id: crypto.randomUUID(),
          role: "error",
          errorType,
          content: errorMessage(errorType, tRef.current),
          retryMessageId: retryUserMsgId,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setPhase({ kind: "idle" });
      }
    },
    [runTurn],
  );

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const currentPhase = phaseRef.current;
      let baseMessages = messages;

      // If a patch is pending confirmation, auto-reject it before sending the
      // new user message. Navigation is applied as a side effect only (no
      // follow-up request) to match the original behavior.
      if (currentPhase.kind === "pending_confirmation") {
        const proposal = currentPhase.proposal;
        try {
          const followupMessages: Anthropic.Messages.MessageParam[] = [
            ...buildApiMessages(messages),
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: proposal.toolUseId,
                  content: "User declined.",
                },
              ],
            },
          ];
          const { text: autoText } = await runTurn(followupMessages, {
            navigateMode: "side_effect",
            extractPatch: false,
          });
          baseMessages = markPatchResolved(messages, proposal, "User declined.", autoText);
        } catch {
          // Silently ignore auto-reject errors — user's new message will proceed regardless
        }
        setMessages(baseMessages);
        setPhase({ kind: "idle" });
      }

      const userMsg: UserChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      const nextMessages = [...baseMessages, userMsg];
      setMessages(nextMessages);
      setPhase({ kind: "loading" });
      await callApi(nextMessages, userMsg.id);
    },
    [messages, callApi, runTurn],
  );

  // ── retryMessage ───────────────────────────────────────────────────────────

  const retryMessage = useCallback(
    async (userMessageId: string): Promise<void> => {
      const idx = messages.findIndex((m) => m.id === userMessageId);
      if (idx === -1) return;
      const trimmed = messages.slice(0, idx + 1);
      setMessages(trimmed);
      setPhase({ kind: "loading" });
      await callApi(trimmed, userMessageId);
    },
    [messages, callApi],
  );

  // ── applyPatch ─────────────────────────────────────────────────────────────

  const applyPatch = useCallback(
    async (proposal: PatchProposal): Promise<void> => {
      const currentHash = await hashContent(fileContentRef.current);
      // eslint-disable-next-line no-console
      console.log("[useChatSession] applyPatch", {
        currentHash,
        contentHashAtProposal: proposal.contentHashAtProposal,
        hashMatch: currentHash === proposal.contentHashAtProposal,
      });
      if (currentHash !== proposal.contentHashAtProposal) {
        // eslint-disable-next-line no-console
        console.warn("[useChatSession] applyPatch: hash mismatch — patch is stale, skipping");
        return;
      }
      const patchResult = applyKrsPatch(
        fileContentRef.current,
        proposal.operation,
        proposal.targetNodeId,
        proposal.content,
      );
      if (!patchResult.ok) {
        // eslint-disable-next-line no-console
        console.error("[useChatSession] applyPatch: patch failed —", patchResult.error);
        setMessages((prev) => [
          ...markPatchResolved(prev, proposal, `Error: ${patchResult.error}`, ""),
          {
            id: crypto.randomUUID(),
            role: "error" as const,
            errorType: "server" as const,
            content: tRef.current("chat.error.patchFailed", { detail: patchResult.error }),
          },
        ]);
        setPhase({ kind: "idle" });
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        "[useChatSession] applyPatch: calling onEditorChange, newContent length =",
        patchResult.source.length,
      );
      onEditorChange(patchResult.source);
      setPhase({ kind: "awaiting_followup" });

      if (!apiKeyRef.current) return;

      const followupMessages: Anthropic.Messages.MessageParam[] = [
        ...buildApiMessages(messages),
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: proposal.toolUseId, content: "Applied." }],
        },
      ];

      try {
        const { text } = await runTurn(followupMessages, {
          navigateMode: "ignore",
          extractPatch: false,
        });
        setMessages((prev) => markPatchResolved(prev, proposal, "Applied.", text));
        setPhase({ kind: "idle" });
      } catch (err) {
        const errorType = classifyError(err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            errorType,
            content: errorMessage(errorType, tRef.current),
          },
        ]);
        setPhase({ kind: "idle" });
      }
    },
    [messages, onEditorChange, runTurn],
  );

  // ── rejectPatch ────────────────────────────────────────────────────────────

  const rejectPatch = useCallback(
    async (proposal: PatchProposal): Promise<void> => {
      setPhase({ kind: "awaiting_followup" });
      if (!apiKeyRef.current) {
        setPhase({ kind: "idle" });
        return;
      }
      const followupMessages: Anthropic.Messages.MessageParam[] = [
        ...buildApiMessages(messages),
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: proposal.toolUseId, content: "User declined." },
          ],
        },
      ];

      try {
        const { text } = await runTurn(followupMessages, {
          navigateMode: "ignore",
          extractPatch: false,
        });
        setMessages((prev) => markPatchResolved(prev, proposal, "User declined.", text));
        setPhase({ kind: "idle" });
      } catch (err) {
        const errorType = classifyError(err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            errorType,
            content: errorMessage(errorType, tRef.current),
          },
        ]);
        setPhase({ kind: "idle" });
      }
    },
    [messages, runTurn],
  );

  // ── startReview ────────────────────────────────────────────────────────────

  const startReview = useCallback(async (): Promise<void> => {
    if (!apiKeyRef.current) return;
    setPhase({ kind: "loading" });

    // Trigger message is NOT stored in the messages state — only the AI's response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: reviewTriggerMessage(locale) },
    ];

    try {
      const { text, patchProposal } = await runTurn(triggerMessages);

      if (text || patchProposal) {
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: text,
            patch: patchProposal,
          },
        ]);
      }
      if (patchProposal) {
        setPhase({ kind: "pending_confirmation", proposal: patchProposal });
      } else {
        setPhase({ kind: "idle" });
      }
    } catch (err) {
      const errorType = classifyError(err);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "error",
          errorType,
          content: errorMessage(errorType, tRef.current),
        },
      ]);
      setPhase({ kind: "idle" });
    }
  }, [runTurn, locale]);

  // ── startInterview ─────────────────────────────────────────────────────────

  const startInterview = useCallback(async (): Promise<void> => {
    if (!apiKeyRef.current) return;
    setPhase({ kind: "loading" });

    // Trigger message is NOT stored in the messages state — only the AI's opening response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: interviewTriggerMessage(locale) },
    ];

    try {
      const { text } = await runTurn(triggerMessages, { extractPatch: false });
      if (text) {
        setMessages([{ id: crypto.randomUUID(), role: "assistant", content: text }]);
      }
      setPhase({ kind: "idle" });
    } catch (err) {
      const errorType = classifyError(err);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "error",
          errorType,
          content: errorMessage(errorType, tRef.current),
        },
      ]);
      setPhase({ kind: "idle" });
    }
  }, [runTurn, locale]);

  return {
    messages,
    phase,
    sendMessage,
    retryMessage,
    applyPatch,
    rejectPatch,
    resetSession,
    startReview,
    startInterview,
  };
}
