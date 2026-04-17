import { useState, useCallback, useEffect, useRef } from "react";
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { applyKrsPatch, type PatchOperation } from "../utils/krs-patch.js";
import type { SystemNode } from "@karasu-tools/core";
import { TOOLS, buildSystemPrompt, hashContent } from "./useChatSession/prompt.js";
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

  // ── Core API call ──────────────────────────────────────────────────────────

  const callApi = useCallback(
    async (history: ChatMessage[], retryUserMsgId?: string): Promise<void> => {
      const key = apiKeyRef.current;
      if (!key) return;

      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

      // Build Anthropic messages from our chat history (exclude error messages)
      const apiMessages = buildApiMessages(history);

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: buildSystemPrompt({
            scopeLabel: scopeLabelRef.current,
            viewPath: viewPathRef.current,
            fileContent: fileContentRef.current,
            currentFilePath: currentFilePathRef.current,
            resolvedSystems: resolvedSystemsRef.current,
          }),
          tools: TOOLS,
          messages: apiMessages,
        });

        let textContent = "";
        let patchProposal: PatchProposal | undefined;

        for (const block of response.content) {
          if (block.type === "text") {
            textContent += block.text;
          } else if (block.type === "tool_use") {
            if (block.name === "navigate_view") {
              const input = block.input as { path: string[] };
              onNavigateViewPath(input.path);
              // navigate_view: send tool_result immediately and get follow-up
              const followupMessages: Anthropic.Messages.MessageParam[] = [
                ...apiMessages,
                { role: "assistant", content: response.content },
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: "Navigated.",
                    },
                  ],
                },
              ];
              const followup = await client.messages.create({
                model: MODEL,
                max_tokens: 4096,
                system: buildSystemPrompt({
                  scopeLabel: scopeLabelRef.current,
                  viewPath: viewPathRef.current,
                  fileContent: fileContentRef.current,
                  currentFilePath: currentFilePathRef.current,
                  resolvedSystems: resolvedSystemsRef.current,
                }),
                tools: TOOLS,
                messages: followupMessages,
              });
              for (const fb of followup.content) {
                if (fb.type === "text") textContent += fb.text;
              }
            } else if (block.name === "apply_krs_patch") {
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

        const assistantMsg: AssistantChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: textContent,
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
          content: errorMessage(errorType),
          retryMessageId: retryUserMsgId,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setPhase({ kind: "idle" });
      }
    },
    [onNavigateViewPath],
  );

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      // If pending_confirmation, auto-reject before sending
      const currentPhase = phaseRef.current;
      let baseMessages = messages;

      if (currentPhase.kind === "pending_confirmation") {
        baseMessages = await autoRejectPatch(
          currentPhase.proposal,
          messages,
          apiKeyRef,
          scopeLabelRef,
          viewPathRef,
          fileContentRef,
          currentFilePathRef,
          resolvedSystemsRef,
          onNavigateViewPath,
        );
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
    [messages, callApi, onNavigateViewPath],
  );

  // ── retryMessage ───────────────────────────────────────────────────────────

  const retryMessage = useCallback(
    async (userMessageId: string): Promise<void> => {
      // Drop messages from the failed user message onward and retry
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
        // Mark patchResult on the assistant message so buildApiMessages can emit a valid
        // tool_result in subsequent requests (Anthropic API requires tool_use → tool_result).
        setMessages((prev) => {
          const resolved = prev.map((m) =>
            m.role === "assistant" && m.patch?.toolUseId === proposal.toolUseId
              ? { ...m, patchResult: `Error: ${patchResult.error}` }
              : m,
          );
          return [
            ...resolved,
            {
              id: crypto.randomUUID(),
              role: "error" as const,
              errorType: "server" as const,
              content: `⚠ パッチの適用に失敗しました: ${patchResult.error}`,
            },
          ];
        });
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

      const key = apiKeyRef.current;
      if (!key) return;
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

      const apiMessages = buildApiMessages(messages);
      const followupMessages: Anthropic.Messages.MessageParam[] = [
        ...apiMessages,
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: proposal.toolUseId,
              content: "Applied.",
            },
          ],
        },
      ];

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: buildSystemPrompt({
            scopeLabel: scopeLabelRef.current,
            viewPath: viewPathRef.current,
            fileContent: fileContentRef.current,
            currentFilePath: currentFilePathRef.current,
            resolvedSystems: resolvedSystemsRef.current,
          }),
          tools: TOOLS,
          messages: followupMessages,
        });
        const text = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        // Mark the patch as resolved so future history builds include the tool_result
        setMessages((prev) => {
          const resolved = prev.map((m) =>
            m.role === "assistant" && m.patch?.toolUseId === proposal.toolUseId
              ? { ...m, patchResult: "Applied." }
              : m,
          );
          if (text) {
            return [
              ...resolved,
              { id: crypto.randomUUID(), role: "assistant" as const, content: text },
            ];
          }
          return resolved;
        });
        setPhase({ kind: "idle" });
      } catch (err) {
        const errorType = classifyError(err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            errorType,
            content: errorMessage(errorType),
          },
        ]);
        setPhase({ kind: "idle" });
      }
    },
    [messages, onEditorChange],
  );

  // ── rejectPatch ────────────────────────────────────────────────────────────

  const rejectPatch = useCallback(
    async (proposal: PatchProposal): Promise<void> => {
      setPhase({ kind: "awaiting_followup" });
      const key = apiKeyRef.current;
      if (!key) {
        setPhase({ kind: "idle" });
        return;
      }
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const apiMessages = buildApiMessages(messages);
      const followupMessages: Anthropic.Messages.MessageParam[] = [
        ...apiMessages,
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

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: buildSystemPrompt({
            scopeLabel: scopeLabelRef.current,
            viewPath: viewPathRef.current,
            fileContent: fileContentRef.current,
            currentFilePath: currentFilePathRef.current,
            resolvedSystems: resolvedSystemsRef.current,
          }),
          tools: TOOLS,
          messages: followupMessages,
        });
        const text = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        // Mark the patch as resolved so future history builds include the tool_result
        setMessages((prev) => {
          const resolved = prev.map((m) =>
            m.role === "assistant" && m.patch?.toolUseId === proposal.toolUseId
              ? { ...m, patchResult: "User declined." }
              : m,
          );
          if (text) {
            return [
              ...resolved,
              { id: crypto.randomUUID(), role: "assistant" as const, content: text },
            ];
          }
          return resolved;
        });
        setPhase({ kind: "idle" });
      } catch (err) {
        const errorType = classifyError(err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "error",
            errorType,
            content: errorMessage(errorType),
          },
        ]);
        setPhase({ kind: "idle" });
      }
    },
    [messages],
  );

  // ── startReview ────────────────────────────────────────────────────────────

  const startReview = useCallback(async (): Promise<void> => {
    const key = apiKeyRef.current;
    if (!key) return;

    setPhase({ kind: "loading" });

    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

    // Send a hidden trigger message to kick off the design review.
    // The trigger is NOT stored in the messages state — only the AI's response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: "設計レビューを開始してください。" },
    ];

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt({
          scopeLabel: scopeLabelRef.current,
          viewPath: viewPathRef.current,
          fileContent: fileContentRef.current,
          currentFilePath: currentFilePathRef.current,
          resolvedSystems: resolvedSystemsRef.current,
        }),
        tools: TOOLS,
        messages: triggerMessages,
      });

      let textContent = "";
      let patchProposal: PatchProposal | undefined;

      for (const block of response.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use" && block.name === "navigate_view") {
          const input = block.input as { path: string[] };
          onNavigateViewPath(input.path);
          // Send tool_result to get follow-up text from the AI
          const followupMessages: Anthropic.Messages.MessageParam[] = [
            ...triggerMessages,
            { role: "assistant", content: response.content },
            {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: block.id, content: "Navigated." }],
            },
          ];
          const followup = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: buildSystemPrompt({
              scopeLabel: scopeLabelRef.current,
              viewPath: viewPathRef.current,
              fileContent: fileContentRef.current,
              currentFilePath: currentFilePathRef.current,
              resolvedSystems: resolvedSystemsRef.current,
            }),
            tools: TOOLS,
            messages: followupMessages,
          });
          for (const fb of followup.content) {
            if (fb.type === "text") textContent += fb.text;
          }
        } else if (block.type === "tool_use" && block.name === "apply_krs_patch") {
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

      const assistantMsg: AssistantChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: textContent,
        patch: patchProposal,
      };

      if (textContent || patchProposal) {
        setMessages([assistantMsg]);
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
          content: errorMessage(errorType),
        },
      ]);
      setPhase({ kind: "idle" });
    }
  }, [onNavigateViewPath]);

  // ── startInterview ─────────────────────────────────────────────────────────

  const startInterview = useCallback(async (): Promise<void> => {
    const key = apiKeyRef.current;
    if (!key) return;

    setPhase({ kind: "loading" });

    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

    // Send a hidden trigger message to kick off the structured interview.
    // The trigger is NOT stored in the messages state — only the AI's opening response is shown.
    const triggerMessages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: "インタビューを開始してください。" },
    ];

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt({
          scopeLabel: scopeLabelRef.current,
          viewPath: viewPathRef.current,
          fileContent: fileContentRef.current,
          currentFilePath: currentFilePathRef.current,
          resolvedSystems: resolvedSystemsRef.current,
        }),
        tools: TOOLS,
        messages: triggerMessages,
      });

      let textContent = "";
      for (const block of response.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use" && block.name === "navigate_view") {
          const input = block.input as { path: string[] };
          onNavigateViewPath(input.path);
          // Send tool_result to get follow-up text from the AI
          const followupMessages: Anthropic.Messages.MessageParam[] = [
            ...triggerMessages,
            { role: "assistant", content: response.content },
            {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: block.id, content: "Navigated." }],
            },
          ];
          const followup = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: buildSystemPrompt({
              scopeLabel: scopeLabelRef.current,
              viewPath: viewPathRef.current,
              fileContent: fileContentRef.current,
              currentFilePath: currentFilePathRef.current,
              resolvedSystems: resolvedSystemsRef.current,
            }),
            tools: TOOLS,
            messages: followupMessages,
          });
          for (const fb of followup.content) {
            if (fb.type === "text") textContent += fb.text;
          }
        }
      }

      if (textContent) {
        setMessages([{ id: crypto.randomUUID(), role: "assistant", content: textContent }]);
      }
      setPhase({ kind: "idle" });
    } catch (err) {
      const errorType = classifyError(err);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "error",
          errorType,
          content: errorMessage(errorType),
        },
      ]);
      setPhase({ kind: "idle" });
    }
  }, [onNavigateViewPath]);

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

// ── Utilities ─────────────────────────────────────────────────────────────────

async function autoRejectPatch(
  proposal: PatchProposal,
  messages: ChatMessage[],
  apiKeyRef: React.MutableRefObject<string | null>,
  scopeLabelRef: React.MutableRefObject<string>,
  viewPathRef: React.MutableRefObject<string[]>,
  fileContentRef: React.MutableRefObject<string>,
  currentFilePathRef: React.MutableRefObject<string | null>,
  resolvedSystemsRef: React.MutableRefObject<SystemNode[]>,
  onNavigateViewPath: (path: string[]) => void,
): Promise<ChatMessage[]> {
  const key = apiKeyRef.current;
  if (!key) return messages;

  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const apiMessages = buildApiMessages(messages);
  const followupMessages: Anthropic.Messages.MessageParam[] = [
    ...apiMessages,
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: proposal.toolUseId, content: "User declined." },
      ],
    },
  ];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt({
        scopeLabel: scopeLabelRef.current,
        viewPath: viewPathRef.current,
        fileContent: fileContentRef.current,
        currentFilePath: currentFilePathRef.current,
        resolvedSystems: resolvedSystemsRef.current,
      }),
      tools: TOOLS,
      messages: followupMessages,
    });
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "navigate_view") {
        const input = block.input as { path: string[] };
        onNavigateViewPath(input.path);
      }
    }
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    // Mark the patch as resolved so future history builds include the tool_result.
    // navigate_view tool_use is intentionally not stored in chat history — it is
    // handled as a pure side effect and never needs a tool_result in stored state.
    const resolved = messages.map((m) =>
      m.role === "assistant" && m.patch?.toolUseId === proposal.toolUseId
        ? { ...m, patchResult: "User declined." }
        : m,
    );
    if (text) {
      return [...resolved, { id: crypto.randomUUID(), role: "assistant" as const, content: text }];
    }
    return resolved;
  } catch {
    // Silently ignore auto-reject errors — user's new message will proceed regardless
  }
  return messages;
}
