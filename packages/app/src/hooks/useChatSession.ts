import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import {
  applyKrsPatch,
  type PatchOperation,
  type SystemNode,
  type OrganizationBlock,
} from "@karasu-tools/core";
import { resolveLocale } from "../i18n/locale.js";
import { useTranslation } from "../i18n/index.js";
import { useLatestRef } from "./useLatestRef.js";
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
  organizations: OrganizationBlock[];
  ownerIndex: Map<string, string>;
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
  /** Aborts the API request(s) when the session is reset mid-flight (#1533). */
  signal?: AbortSignal;
  /**
   * True once this turn's session has been superseded (project switch / New
   * Session / a newer operation). When stale, the `navigate_view` side effect
   * is suppressed so a reply for the old session can't move the new view.
   */
  isStale?: () => boolean;
}

/**
 * Handle for one async operation: the {@link AbortSignal} to pass to the API
 * and an `isStale()` guard, both tied to the generation captured when the
 * operation began. See {@link useChatSession}'s `beginOperation` (#1533).
 */
interface Operation {
  signal: AbortSignal;
  isStale: () => boolean;
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

// Builds the ErrorChatMessage shown in the chat log for a failed API call.
// Shared by every catch block in this hook so error shape/translation stays
// in one place; callers decide whether to append or replace `messages`.
function makeErrorMessage(
  err: unknown,
  t: Parameters<typeof errorMessage>[1],
  retryMessageId?: string,
): ErrorChatMessage {
  const errorType = classifyError(err);
  return {
    id: crypto.randomUUID(),
    role: "error",
    errorType,
    content: errorMessage(errorType, t),
    retryMessageId,
  };
}

// Appends a `tool_result` user turn to `history`, the shape the Anthropic API
// requires immediately after a `tool_use` block. Callers build `history`
// differently (via `buildApiMessages` or by threading the just-received
// assistant turn), so this only owns the common tail.
function withToolResult(
  history: Anthropic.Messages.MessageParam[],
  toolUseId: string,
  content: string,
): Anthropic.Messages.MessageParam[] {
  return [
    ...history,
    { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content }] },
  ];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChatSession({
  fileContent,
  currentFilePath,
  scopeLabel,
  viewPath,
  resolvedSystems,
  organizations,
  ownerIndex,
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
  const tRef = useLatestRef(t);

  // Keep a ref to the current phase so async callbacks can read the latest value
  const phaseRef = useLatestRef<SessionPhase>(phase);

  // Keep a ref to the latest apiKey / fileContent / currentFilePath / scopeLabel for use in callbacks
  const fileContentRef = useLatestRef(fileContent);
  const currentFilePathRef = useLatestRef(currentFilePath);
  const scopeLabelRef = useLatestRef(scopeLabel);
  const viewPathRef = useLatestRef(viewPath);
  const resolvedSystemsRef = useLatestRef(resolvedSystems);
  const organizationsRef = useLatestRef(organizations);
  const ownerIndexRef = useLatestRef(ownerIndex);
  const apiKeyRef = useLatestRef(apiKey);

  // Generation guard (#1533). `resetSession` (project switch / New Session) and
  // each new operation bump the generation and abort the in-flight request, so
  // an earlier turn's reply — its `setMessages`/`setPhase` writes AND its
  // `navigate_view` side effect — is dropped instead of leaking into the
  // freshly-cleared session.
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const beginOperation = useCallback((): Operation => {
    abortRef.current?.abort();
    generationRef.current++;
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = generationRef.current;
    return {
      signal: controller.signal,
      isStale: () => generation !== generationRef.current,
    };
  }, []);

  const resetSession = useCallback(() => {
    generationRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPhase({ kind: "idle" });
  }, []);

  useEffect(() => {
    resetSession();
  }, [sessionResetKey, resetSession]);

  // Abort any in-flight request when the hook unmounts — ChatPane is unmounted
  // when the user switches to the Editor tab, and without this the request runs
  // to completion against a torn-down session (wasted work + a setState the
  // generation guard can't catch, since unmount doesn't bump it) (#1533).
  useEffect(() => () => abortRef.current?.abort(), []);

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
      const { navigateMode = "followup", extractPatch = true, signal, isStale } = options;

      const key = apiKeyRef.current;
      if (!key) return { text: "" };

      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const system = buildSystemPrompt({
        scopeLabel: scopeLabelRef.current,
        viewPath: viewPathRef.current,
        fileContent: fileContentRef.current,
        currentFilePath: currentFilePathRef.current,
        resolvedSystems: resolvedSystemsRef.current,
        organizations: organizationsRef.current,
        ownerIndex: ownerIndexRef.current,
        locale,
      });

      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 4096,
          system,
          tools,
          messages: apiMessages,
        },
        { signal },
      );

      let text = "";
      let patchProposal: PatchProposal | undefined;
      let navigateToolUseId: string | undefined;

      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          if (block.name === "navigate_view" && navigateMode !== "ignore" && !isStale?.()) {
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
        const followupMessages = withToolResult(
          [...apiMessages, { role: "assistant", content: response.content }],
          navigateToolUseId,
          "Navigated.",
        );
        const followup = await client.messages.create(
          {
            model: MODEL,
            max_tokens: 4096,
            system,
            tools,
            messages: followupMessages,
          },
          { signal },
        );
        for (const fb of followup.content) {
          if (fb.type === "text") text += fb.text;
        }
      }

      return { text, patchProposal };
    },
    // The `*Ref` deps are stable ref objects (only `.current` is read inside
    // the callback), so listing them satisfies exhaustive-deps without
    // changing when `runTurn` is recreated.
    [
      onNavigateViewPath,
      locale,
      tools,
      apiKeyRef,
      scopeLabelRef,
      viewPathRef,
      fileContentRef,
      currentFilePathRef,
      resolvedSystemsRef,
      organizationsRef,
      ownerIndexRef,
    ],
  );

  // ── callApi ────────────────────────────────────────────────────────────────

  const callApi = useCallback(
    async (history: ChatMessage[], op: Operation, retryUserMsgId?: string): Promise<void> => {
      if (!apiKeyRef.current) return;
      const apiMessages = buildApiMessages(history);

      try {
        const { text, patchProposal } = await runTurn(apiMessages, {
          signal: op.signal,
          isStale: op.isStale,
        });
        // The session was reset (or superseded) while awaiting — drop this
        // reply so it can't append to the new session (#1533).
        if (op.isStale()) return;

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
        // The reset aborts the request, which surfaces here as an error — a
        // superseded failure is dropped rather than logged into the new
        // session (#1533).
        if (op.isStale()) return;
        // eslint-disable-next-line no-console
        console.error(
          "[useChatSession] API error:",
          err instanceof APIError
            ? { status: err.status, message: err.message, error: err.error }
            : err,
        );
        const errorMsg = makeErrorMessage(err, tRef.current, retryUserMsgId);
        setMessages((prev) => [...prev, errorMsg]);
        setPhase({ kind: "idle" });
      }
    },
    // `apiKeyRef` / `tRef` are stable ref objects — listing them satisfies
    // exhaustive-deps without changing when `callApi` is recreated.
    [runTurn, apiKeyRef, tRef],
  );

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const op = beginOperation();
      const currentPhase = phaseRef.current;
      let baseMessages = messages;

      // If a patch is pending confirmation, auto-reject it before sending the
      // new user message. Navigation is applied as a side effect only (no
      // follow-up request) to match the original behavior.
      if (currentPhase.kind === "pending_confirmation") {
        const proposal = currentPhase.proposal;
        try {
          const followupMessages = withToolResult(
            buildApiMessages(messages),
            proposal.toolUseId,
            "User declined.",
          );
          const { text: autoText } = await runTurn(followupMessages, {
            navigateMode: "side_effect",
            extractPatch: false,
            signal: op.signal,
            isStale: op.isStale,
          });
          baseMessages = markPatchResolved(messages, proposal, "User declined.", autoText);
        } catch {
          // Silently ignore auto-reject errors — user's new message will proceed regardless
        }
        // A reset during the auto-reject supersedes this send entirely (#1533).
        if (op.isStale()) return;
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
      await callApi(nextMessages, op, userMsg.id);
    },
    // `phaseRef` is a stable ref object — listing it satisfies exhaustive-deps
    // without changing when `sendMessage` is recreated.
    [messages, callApi, runTurn, beginOperation, phaseRef],
  );

  // ── retryMessage ───────────────────────────────────────────────────────────

  const retryMessage = useCallback(
    async (userMessageId: string): Promise<void> => {
      const idx = messages.findIndex((m) => m.id === userMessageId);
      if (idx === -1) return;
      const op = beginOperation();
      const trimmed = messages.slice(0, idx + 1);
      setMessages(trimmed);
      setPhase({ kind: "loading" });
      await callApi(trimmed, op, userMessageId);
    },
    [messages, callApi, beginOperation],
  );

  // ── applyPatch ─────────────────────────────────────────────────────────────

  const applyPatch = useCallback(
    async (proposal: PatchProposal): Promise<void> => {
      const currentHash = await hashContent(fileContentRef.current);
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
      onEditorChange(patchResult.source);
      setPhase({ kind: "awaiting_followup" });

      if (!apiKeyRef.current) return;

      const op = beginOperation();
      const followupMessages = withToolResult(
        buildApiMessages(messages),
        proposal.toolUseId,
        "Applied.",
      );

      try {
        const { text } = await runTurn(followupMessages, {
          navigateMode: "ignore",
          extractPatch: false,
          signal: op.signal,
          isStale: op.isStale,
        });
        if (op.isStale()) return;
        setMessages((prev) => markPatchResolved(prev, proposal, "Applied.", text));
        setPhase({ kind: "idle" });
      } catch (err) {
        if (op.isStale()) return;
        setMessages((prev) => [...prev, makeErrorMessage(err, tRef.current)]);
        setPhase({ kind: "idle" });
      }
    },
    // `tRef` / `apiKeyRef` / `fileContentRef` are stable ref objects — listing
    // them satisfies exhaustive-deps without changing when `applyPatch` is
    // recreated.
    [messages, onEditorChange, runTurn, beginOperation, tRef, apiKeyRef, fileContentRef],
  );

  // ── rejectPatch ────────────────────────────────────────────────────────────

  const rejectPatch = useCallback(
    async (proposal: PatchProposal): Promise<void> => {
      setPhase({ kind: "awaiting_followup" });
      if (!apiKeyRef.current) {
        setPhase({ kind: "idle" });
        return;
      }
      const op = beginOperation();
      const followupMessages = withToolResult(
        buildApiMessages(messages),
        proposal.toolUseId,
        "User declined.",
      );

      try {
        const { text } = await runTurn(followupMessages, {
          navigateMode: "ignore",
          extractPatch: false,
          signal: op.signal,
          isStale: op.isStale,
        });
        if (op.isStale()) return;
        setMessages((prev) => markPatchResolved(prev, proposal, "User declined.", text));
        setPhase({ kind: "idle" });
      } catch (err) {
        if (op.isStale()) return;
        setMessages((prev) => [...prev, makeErrorMessage(err, tRef.current)]);
        setPhase({ kind: "idle" });
      }
    },
    // `apiKeyRef` / `tRef` are stable ref objects — listing them satisfies
    // exhaustive-deps without changing when `rejectPatch` is recreated.
    [messages, runTurn, beginOperation, apiKeyRef, tRef],
  );

  // ── startReview ────────────────────────────────────────────────────────────

  const startReview = useCallback(async (): Promise<void> => {
    if (!apiKeyRef.current) return;
    const op = beginOperation();
    setPhase({ kind: "loading" });

    // Trigger message is NOT stored in the messages state — only the AI's response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: reviewTriggerMessage(locale) },
    ];

    try {
      const { text, patchProposal } = await runTurn(triggerMessages, {
        signal: op.signal,
        isStale: op.isStale,
      });
      if (op.isStale()) return;

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
      if (op.isStale()) return;
      setMessages([makeErrorMessage(err, tRef.current)]);
      setPhase({ kind: "idle" });
    }
    // `apiKeyRef` / `tRef` are stable ref objects — listing them satisfies
    // exhaustive-deps without changing when `startReview` is recreated.
  }, [runTurn, locale, beginOperation, apiKeyRef, tRef]);

  // ── startInterview ─────────────────────────────────────────────────────────

  const startInterview = useCallback(async (): Promise<void> => {
    if (!apiKeyRef.current) return;
    const op = beginOperation();
    setPhase({ kind: "loading" });

    // Trigger message is NOT stored in the messages state — only the AI's opening response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: interviewTriggerMessage(locale) },
    ];

    try {
      const { text } = await runTurn(triggerMessages, {
        extractPatch: false,
        signal: op.signal,
        isStale: op.isStale,
      });
      if (op.isStale()) return;
      if (text) {
        setMessages([{ id: crypto.randomUUID(), role: "assistant", content: text }]);
      }
      setPhase({ kind: "idle" });
    } catch (err) {
      if (op.isStale()) return;
      setMessages([makeErrorMessage(err, tRef.current)]);
      setPhase({ kind: "idle" });
    }
    // `apiKeyRef` / `tRef` are stable ref objects — listing them satisfies
    // exhaustive-deps without changing when `startInterview` is recreated.
  }, [runTurn, locale, beginOperation, apiKeyRef, tRef]);

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
