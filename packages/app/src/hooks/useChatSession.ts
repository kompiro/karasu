import { useState, useCallback, useEffect, useRef } from "react";
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { applyKrsPatch, type PatchOperation } from "../utils/krs-patch.js";
import type { SystemNode, KrsNode, KrsEdge, LinkEntry } from "@karasu-tools/core";

const MODEL = "claude-sonnet-4-6";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PatchProposal {
  toolUseId: string;
  operation: PatchOperation;
  targetNodeId?: string;
  content?: string;
  description: string;
  contentHashAtProposal: string;
}

interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
}

interface AssistantChatMessage {
  id: string;
  role: "assistant";
  content: string;
  patch?: PatchProposal;
  /** Set after the patch is resolved (applied or rejected) to keep history valid */
  patchResult?: string;
}

interface ErrorChatMessage {
  id: string;
  role: "error";
  errorType: "auth" | "rate_limit" | "server";
  content: string;
  retryMessageId?: string;
}

type ChatMessage = UserChatMessage | AssistantChatMessage | ErrorChatMessage;

type SessionPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "pending_confirmation"; proposal: PatchProposal }
  | { kind: "awaiting_followup" };

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

// ── Drill-down level detection ────────────────────────────────────────────────

export type DrillDownLevel = "system" | "service" | "domain" | "usecase";

export function detectDrillDownLevel(
  viewPath: string[],
  resolvedSystems: SystemNode[],
): DrillDownLevel {
  if (viewPath.length === 0 || resolvedSystems.length === 0) return "system";

  const system = resolvedSystems.find((s) => s.id === viewPath[0]);
  if (!system || viewPath.length === 1) return "system";

  let current: KrsNode = system;
  for (let i = 1; i < viewPath.length; i++) {
    const child = current.children.find((c) => c.id === viewPath[i]);
    if (!child) return "system";
    current = child;
  }

  const kind = current.kind;
  if (kind === "service") return "service";
  if (kind === "domain") return "domain";
  if (kind === "usecase") return "usecase";
  return "system";
}

function interviewGuideForLevel(level: DrillDownLevel): string {
  switch (level) {
    case "system":
      return `このスコープ（システムレベル）では以下の要素の追加を検討してください：
- **service**: システムを構成するサービス
- **user**: システムを利用するユーザー種別
- **external**: 外部システム・外部サービス
- **rel**: サービス・ユーザー・外部システム間の依存関係`;
    case "service":
      return `このスコープ（サービスレベル）では以下の要素の追加を検討してください：
- **domain**: サービスを構成するドメイン（境界コンテキスト）
- **team**: ドメインのオーナーチームと連絡先（Slack / Teams など）`;
    case "domain":
      return `このスコープ（ドメインレベル）では以下の要素の追加を検討してください：
- **usecase**: ドメインが提供するユースケース（ユーザーアクションや業務ロジック）`;
    case "usecase":
      return `このスコープ（ユースケースレベル）では以下の要素の追加を検討してください：
- **resource**: ユースケースが参照・操作するリソース（ドット記法: ServiceId.TableId など）`;
  }
}

// ── Model graph serialisation ─────────────────────────────────────────────────

interface SerializedEdge {
  from: string;
  to: string;
  label?: string;
  kind: string;
  tags: string[];
}

interface SerializedNode {
  id: string;
  kind: string;
  label?: string;
  team?: string;
  links?: Array<{ url: string; label?: string }>;
  children?: SerializedNode[];
  edges?: SerializedEdge[];
}

function serializeEdges(edges: KrsEdge[]): SerializedEdge[] {
  return edges.map((e) => ({
    from: e.from,
    to: e.to,
    ...(e.label ? { label: e.label } : {}),
    kind: e.kind,
    tags: e.tags,
  }));
}

function serializeNode(node: KrsNode): SerializedNode {
  const out: SerializedNode = {
    id: node.id,
    kind: node.kind,
    ...(node.label ? { label: node.label } : {}),
  };
  const props = node.properties as { links: LinkEntry[]; team?: string };
  if (props.team) out.team = props.team;
  if (props.links.length) {
    out.links = props.links.map((l) => ({ url: l.url, ...(l.label ? { label: l.label } : {}) }));
  }
  if (node.children.length) out.children = node.children.map(serializeNode);
  if (node.edges.length) out.edges = serializeEdges(node.edges);
  return out;
}

function serializeModelGraph(systems: SystemNode[]): string {
  const serialized = systems.map((sys) => {
    const links = sys.properties.links;
    return {
      id: sys.id,
      kind: "system",
      ...(sys.label ? { label: sys.label } : {}),
      ...(links.length
        ? { links: links.map((l) => ({ url: l.url, ...(l.label ? { label: l.label } : {}) })) }
        : {}),
      children: sys.children.map(serializeNode),
      edges: serializeEdges(sys.edges),
    };
  });
  return JSON.stringify({ systems: serialized }, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────

async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "navigate_view",
    description: "ダイアグラムのドリルダウン位置を変更する",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "array",
          items: { type: "string" },
          description: "遷移先の ViewPath（例: ['ECPlatform', 'ECommerce']）",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "apply_krs_patch",
    description: ".krs ファイルに変更を適用する",
    input_schema: {
      type: "object" as const,
      properties: {
        operation: {
          type: "string",
          enum: ["append", "replace", "remove"],
          description:
            "変更の種類: append=新しいトップレベルブロックを末尾に追加, replace=既存ノードをブロックごと置換, remove=既存ノードを削除",
        },
        targetNodeId: {
          type: "string",
          description: "replace/remove 時: 対象ノードの ID（PascalCase）",
        },
        content: {
          type: "string",
          description: "append/replace 時: 追加・置換するブロック全体の .krs テキスト",
        },
        description: {
          type: "string",
          description: "変更内容の説明（ユーザーへの確認メッセージ）",
        },
      },
      required: ["operation", "description"],
    },
  },
];

function buildSystemPrompt(
  scopeLabel: string,
  viewPath: string[],
  fileContent: string,
  currentFilePath: string | null,
  resolvedSystems: SystemNode[],
): string {
  const fileSection = currentFilePath
    ? `## 編集対象ファイル\n${currentFilePath}\n\n## ファイルの内容\n${fileContent}`
    : `## ファイルの内容\n${fileContent}`;

  const modelGraph = serializeModelGraph(resolvedSystems);
  const modelSection =
    resolvedSystems.length > 0
      ? `## アーキテクチャモデル全体（全ファイルを統合したグラフ）\n\`\`\`json\n${modelGraph}\n\`\`\``
      : "";

  const level = detectDrillDownLevel(viewPath, resolvedSystems);
  const interviewGuide = interviewGuideForLevel(level);

  return `あなたは karasu アーキテクチャモデリングツールのアシスタントです。
ユーザーが .krs ファイルを育てる支援と、アーキテクチャモデルへの自然言語クエリに答えます。

## 現在のスコープ
${scopeLabel}

${fileSection}

${modelSection}

## 構造化インタビュー — 現在スコープで追加すべき要素
${interviewGuide}

インタビュー開始時は、上記のガイドと現在の .krs 内容を踏まえ、**1〜2 個の具体的な質問**で会話を始めてください。
既に定義済みの要素は省略し、まだ定義されていないものに絞って質問してください。
id の候補が曖昧な場合は英語 PascalCase で提案し、ユーザーに確認してください。

## 対応するクエリの種類

### モデル編集
- .krs に新しい service / domain / usecase などを追加・変更する
- 変更を提案する場合は apply_krs_patch ツールを使用する

### インパクト分析（グラフトラバーサル）
上記の「アーキテクチャモデル全体」の JSON を使って依存関係を解析する：
- 「X を変更したとき影響するサービスは？」→ すべてのノードの edges を走査して edge.to === X.id を持つノードを列挙する（X 自身の edges ではなく全ノードのエッジを逆引きする）
- 「X が依存している外部サービスは？」→ X の edges で to が [external] のノードを列挙する
- 「X のユースケースをすべて教えて」→ X 配下の usecase ノードを children から再帰的に収集する
- 回答には node の id と label を含め、ダイアグラムで見たい場合は navigate_view ツールを使う

### 組織クエリ
team プロパティと links（Slack / Teams / チームページ等）を使って組織情報を返す：
- 「X に依存しているチームは？」→ X に依存するサービスの team と links を収集する
- 「オンボーディングで最初に会うべき人は？」→ エッジ数が多いサービスの team と links を返す

## ルール
- .krs が source of truth。チャット履歴ではなく常に最新の内容を参照する
- id は英語 PascalCase で提案する。label はユーザーの言語（日本語可）で出力する
- 変更を提案する場合は apply_krs_patch ツールを使用する
  - 新しいトップレベルブロックを追加する場合: operation="append", content=ブロック全体
  - 既存ノードを変更する場合（child 追加含む）: operation="replace", targetNodeId=対象ノード ID, content=置換後のブロック全体
  - ノードを削除する場合: operation="remove", targetNodeId=対象ノード ID
- 編集対象ファイルが import 文のみの場合は、ファイルツリーで対象ファイルを選択するようユーザーに案内する
- ダイアグラムのナビゲーションを提案する場合は navigate_view ツールを使用する
- 一度に多くを変更せず、1-2 個の提案に絞る`;
}

function classifyError(err: unknown): ErrorChatMessage["errorType"] {
  if (err instanceof APIError) {
    if (err.status === 401) return "auth";
    if (err.status === 429) return "rate_limit";
    return "server";
  }
  return "server";
}

function errorMessage(errorType: ErrorChatMessage["errorType"]): string {
  switch (errorType) {
    case "auth":
      return "⚠ APIキーが無効です。Settings で正しいキーを設定してください。";
    case "rate_limit":
      return "⚠ リクエスト制限に達しました。しばらく待ってから再試行してください。";
    case "server":
      return "⚠ Anthropic サーバーエラーです。しばらく待ってから再試行してください。";
  }
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
          system: buildSystemPrompt(
            scopeLabelRef.current,
            viewPathRef.current,
            fileContentRef.current,
            currentFilePathRef.current,
            resolvedSystemsRef.current,
          ),
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
                system: buildSystemPrompt(
                  scopeLabelRef.current,
                  fileContentRef.current,
                  currentFilePathRef.current,
                  resolvedSystemsRef.current,
                ),
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
          system: buildSystemPrompt(
            scopeLabelRef.current,
            viewPathRef.current,
            fileContentRef.current,
            currentFilePathRef.current,
            resolvedSystemsRef.current,
          ),
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
          system: buildSystemPrompt(
            scopeLabelRef.current,
            viewPathRef.current,
            fileContentRef.current,
            currentFilePathRef.current,
            resolvedSystemsRef.current,
          ),
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
        system: buildSystemPrompt(
          scopeLabelRef.current,
          viewPathRef.current,
          fileContentRef.current,
          currentFilePathRef.current,
          resolvedSystemsRef.current,
        ),
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
    startInterview,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildApiMessages(history: ChatMessage[]): Anthropic.Messages.MessageParam[] {
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
      system: buildSystemPrompt(
        scopeLabelRef.current,
        viewPathRef.current,
        fileContentRef.current,
        currentFilePathRef.current,
        resolvedSystemsRef.current,
      ),
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
