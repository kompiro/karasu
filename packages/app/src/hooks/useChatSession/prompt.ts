import type Anthropic from "@anthropic-ai/sdk";
import type {
  SystemNode,
  KrsNode,
  KrsEdge,
  LinkEntry,
  OrganizationBlock,
  TeamNode,
  MemberNode,
} from "@karasu-tools/core";
import type { Locale } from "../../i18n/locale";

// ── Drill-down level detection ────────────────────────────────────────────────

type DrillDownLevel = "system" | "service" | "domain" | "usecase";

export function detectDrillDownLevel(
  viewPath: string[],
  resolvedSystems: SystemNode[],
): DrillDownLevel {
  if (viewPath.length === 0 || resolvedSystems.length === 0) return "system";

  const system = resolvedSystems.find((s) => s.id === viewPath[0]);
  if (!system || viewPath.length === 1) return "system";

  let current: KrsNode = system;
  for (let i = 1; i < viewPath.length; i++) {
    const child: KrsNode | undefined = current.children.find((c) => c.id === viewPath[i]);
    if (!child) return "system";
    current = child;
  }

  const kind = current.kind;
  if (kind === "service") return "service";
  if (kind === "domain") return "domain";
  if (kind === "usecase") return "usecase";
  return "system";
}

function interviewGuideForLevelJa(level: DrillDownLevel): string {
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
- **オーナーシップ**: サービスのオーナーチームは organization ブロックの team で宣言し、owns で紐づける（連絡先は team の link）`;
    case "domain":
      return `このスコープ（ドメインレベル）では以下の要素の追加を検討してください：
- **usecase**: ドメインが提供するユースケース（ユーザーアクションや業務ロジック）`;
    case "usecase":
      return `このスコープ（ユースケースレベル）では以下の要素の追加を検討してください：
- **resource**: ユースケースが参照・操作するリソース（ドット記法: ServiceId.TableId など）`;
  }
}

function interviewGuideForLevelEn(level: DrillDownLevel): string {
  switch (level) {
    case "system":
      return `At this scope (system level), consider adding the following elements:
- **service**: services that make up the system
- **user**: types of users who use the system
- **external**: external systems and services
- **rel**: dependencies between services, users, and external systems`;
    case "service":
      return `At this scope (service level), consider adding the following elements:
- **domain**: domains (bounded contexts) that make up the service
- **ownership**: declare the service's owner team in an organization block's team and link it with owns (contacts go on the team's link)`;
    case "domain":
      return `At this scope (domain level), consider adding the following elements:
- **usecase**: usecases the domain provides (user actions or business logic)`;
    case "usecase":
      return `At this scope (usecase level), consider adding the following elements:
- **resource**: resources the usecase reads or writes (dot notation: ServiceId.TableId, etc.)`;
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
  /** Resolved primary owner team id (from ownerIndex), if any. */
  owner?: string;
  links?: Array<{ url: string; label?: string }>;
  children?: SerializedNode[];
  edges?: SerializedEdge[];
}

interface SerializedMember {
  id: string;
  label?: string;
  slack?: string;
  github?: string;
}

interface SerializedTeam {
  id: string;
  label?: string;
  owns: string[];
  annotations?: string[];
  links?: Array<{ url: string; label?: string }>;
  members?: SerializedMember[];
  subteams?: SerializedTeam[];
}

interface SerializedOrganization {
  id: string;
  label?: string;
  teams: SerializedTeam[];
}

function serializeLinks(links: LinkEntry[]): Array<{ url: string; label?: string }> | undefined {
  if (!links.length) return undefined;
  return links.map((l) => ({ url: l.url, ...(l.label ? { label: l.label } : {}) }));
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

function serializeNode(node: KrsNode, ownerIndex: Map<string, string>): SerializedNode {
  const owner = ownerIndex.get(node.id);
  const out: SerializedNode = {
    id: node.id,
    kind: node.kind,
    ...(node.label ? { label: node.label } : {}),
    ...(owner ? { owner } : {}),
  };
  const props = node.properties as { links: LinkEntry[] };
  const links = serializeLinks(props.links);
  if (links) out.links = links;
  if (node.children.length) out.children = node.children.map((c) => serializeNode(c, ownerIndex));
  if (node.edges.length) out.edges = serializeEdges(node.edges);
  return out;
}

function serializeTeam(team: TeamNode): SerializedTeam {
  const members = team.children.filter((c): c is MemberNode => c.kind === "member");
  const subteams = team.children.filter((c): c is TeamNode => c.kind === "team");
  const links = serializeLinks(team.properties.links);
  return {
    id: team.id,
    ...(team.label ? { label: team.label } : {}),
    owns: team.properties.owns,
    ...(team.annotations.length ? { annotations: team.annotations } : {}),
    ...(links ? { links } : {}),
    ...(members.length
      ? {
          members: members.map((m) => ({
            id: m.id,
            ...(m.label ? { label: m.label } : {}),
            ...(m.properties.slack ? { slack: m.properties.slack } : {}),
            ...(m.properties.github ? { github: m.properties.github } : {}),
          })),
        }
      : {}),
    ...(subteams.length ? { subteams: subteams.map(serializeTeam) } : {}),
  };
}

function serializeOrganizations(organizations: OrganizationBlock[]): SerializedOrganization[] {
  return organizations.map((org) => ({
    id: org.id,
    ...(org.label ? { label: org.label } : {}),
    teams: org.teams.map(serializeTeam),
  }));
}

function serializeModelGraph(
  systems: SystemNode[],
  organizations: OrganizationBlock[],
  ownerIndex: Map<string, string>,
): string {
  const serialized = systems.map((sys) => {
    const links = serializeLinks(sys.properties.links);
    const owner = ownerIndex.get(sys.id);
    return {
      id: sys.id,
      kind: "system",
      ...(sys.label ? { label: sys.label } : {}),
      ...(owner ? { owner } : {}),
      ...(links ? { links } : {}),
      children: sys.children.map((c) => serializeNode(c, ownerIndex)),
      edges: serializeEdges(sys.edges),
    };
  });
  return JSON.stringify(
    {
      systems: serialized,
      ...(organizations.length ? { organizations: serializeOrganizations(organizations) } : {}),
    },
    null,
    2,
  );
}

// ── Content hash ──────────────────────────────────────────────────────────────

export async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

// ── Tool definitions ──────────────────────────────────────────────────────────
//
// Tool descriptions are localized per the active session locale (Phase E).
// Claude routes tool selection by name/shape, not description language, so
// localizing here is purely to keep the system prompt and tool descriptions
// in the same language for coherence when the user inspects a transcript.

interface ToolStrings {
  navigateView: string;
  navigateViewPath: string;
  applyKrsPatch: string;
  operation: string;
  targetNodeId: string;
  content: string;
  description: string;
}

const TOOL_STRINGS_JA: ToolStrings = {
  navigateView: "ダイアグラムのドリルダウン位置を変更する",
  navigateViewPath: "遷移先の ViewPath（例: ['ECPlatform', 'ECommerce']）",
  applyKrsPatch: ".krs ファイルに変更を適用する",
  operation:
    "変更の種類: append=新しいトップレベルブロックを末尾に追加, replace=既存ノードをブロックごと置換, remove=既存ノードを削除",
  targetNodeId: "replace/remove 時: 対象ノードの ID（PascalCase）",
  content: "append/replace 時: 追加・置換するブロック全体の .krs テキスト",
  description: "変更内容の説明（ユーザーへの確認メッセージ）",
};

const TOOL_STRINGS_EN: ToolStrings = {
  navigateView: "Change the drill-down position in the diagram",
  navigateViewPath: "Destination ViewPath (e.g. ['ECPlatform', 'ECommerce'])",
  applyKrsPatch: "Apply a change to the .krs file",
  operation:
    "Change kind: append=add a new top-level block at the end, replace=replace an existing node with a whole block, remove=delete an existing node",
  targetNodeId: "For replace/remove: the id of the target node (PascalCase)",
  content: "For append/replace: the full .krs text of the block being added or used as replacement",
  description: "Description of the change (confirmation message shown to the user)",
};

export function buildTools(locale: Locale): Anthropic.Messages.Tool[] {
  const s = locale === "ja" ? TOOL_STRINGS_JA : TOOL_STRINGS_EN;
  return [
    {
      name: "navigate_view",
      description: s.navigateView,
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "array",
            items: { type: "string" },
            description: s.navigateViewPath,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "apply_krs_patch",
      description: s.applyKrsPatch,
      input_schema: {
        type: "object" as const,
        properties: {
          operation: {
            type: "string",
            enum: ["append", "replace", "remove"],
            description: s.operation,
          },
          targetNodeId: {
            type: "string",
            description: s.targetNodeId,
          },
          content: {
            type: "string",
            description: s.content,
          },
          description: {
            type: "string",
            description: s.description,
          },
        },
        required: ["operation", "description"],
      },
    },
  ];
}

// ── Trigger messages ──────────────────────────────────────────────────────────
//
// Synthetic first-turn user messages sent by startReview / startInterview.
// These are not shown in the chat log — they only prime the assistant to
// follow the "design review" / "structured interview" branches of the
// system prompt. Must match the trigger phrases the system prompt expects.

export function reviewTriggerMessage(locale: Locale): string {
  return locale === "ja" ? "設計レビューを開始してください。" : "Please start a design review.";
}

export function interviewTriggerMessage(locale: Locale): string {
  return locale === "ja" ? "インタビューを開始してください。" : "Please start the interview.";
}

// ── System prompt ─────────────────────────────────────────────────────────────

export interface BuildSystemPromptArgs {
  scopeLabel: string;
  viewPath: string[];
  fileContent: string;
  currentFilePath: string | null;
  resolvedSystems: SystemNode[];
  /** Merged organization graph across all files (teams / owns / members / links). */
  organizations: OrganizationBlock[];
  /** Resolved primary owner per service/domain id, merged across all files. */
  ownerIndex: Map<string, string>;
  locale: Locale;
}

export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
  return args.locale === "ja" ? buildSystemPromptJa(args) : buildSystemPromptEn(args);
}

function buildSystemPromptJa(args: BuildSystemPromptArgs): string {
  const {
    scopeLabel,
    viewPath,
    fileContent,
    currentFilePath,
    resolvedSystems,
    organizations,
    ownerIndex,
  } = args;

  const fileSection = currentFilePath
    ? `## 編集対象ファイル\n${currentFilePath}\n\n## ファイルの内容\n${fileContent}`
    : `## ファイルの内容\n${fileContent}`;

  const modelGraph = serializeModelGraph(resolvedSystems, organizations, ownerIndex);
  const modelSection =
    resolvedSystems.length > 0 || organizations.length > 0
      ? `## アーキテクチャモデル全体（全ファイルを統合したグラフ）\n\`\`\`json\n${modelGraph}\n\`\`\``
      : "";

  const level = detectDrillDownLevel(viewPath, resolvedSystems);
  const interviewGuide = interviewGuideForLevelJa(level);

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
上記「アーキテクチャモデル全体」JSON の \`organizations\` セクション（全ファイルを統合した組織グラフ）を使って組織情報を返す。各 team は \`owns\`（所有するサービス / ドメイン）・\`links\`（Slack / Teams / チームページ等）・\`members\`（\`slack\` / \`github\`）・\`subteams\` を持ち、各サービス / ドメインノードには解決済みの主オーナーが \`owner\`（team の id）として注記される：
- 「X のオーナーチームは？」「X の連絡先は？」→ X ノードの \`owner\` から team を引き、その team の \`links\` / \`members\` を返す
- 「X に依存しているチームは？」→ X に依存するサービス（edges を逆引き）の \`owner\` team と、その team の \`links\` を収集する
- 「オンボーディングで最初に会うべき人は？」→ エッジ数が多いサービスの \`owner\` team と、その \`links\` / \`members\` を返す

組織グラフは \`organizations\` セクションに統合済みなので、organization ブロックが import 元の別ファイルで宣言されていても解決できる。ファイル内容（現在のファイルのみ）に依存しないこと。

## org 図（organization ブロック）の構文

    organization "会社名" {
      team BackendTeam "バックエンドチーム" {
        owns: ECommerceService
        member AliceUser "Alice" {
          slack: "@alice"
        }
        team CoreSubTeam "コアサブチーム" {   // サブチームはこのようにネストする
          owns: PaymentService
        }
      }
    }

- team ブロックは organization の直下、または別の team ブロックの内側にネストできる（サブチーム）
- サブチームを追加する場合は **親チームごと replace** する: operation="replace", targetNodeId=親チームの ID, content=サブチームを含む親チームブロック全体
- organization ブロック自体を replace することもできる

## 設計レビュー

ユーザーから「レビューして」「設計を見て」「review」などレビューを依頼された場合、または
"設計レビューを開始してください" というトリガーメッセージを受信した場合は、
以下のパターンを現在のスコープに含まれるノードに対して確認し、重要度付きで報告する。

### チェックパターン

| パターン | 確認内容 | 重要度 |
|---|---|---|
| 神サービス | children に domain が 5 つ以上あるサービス | [重大] |
| ラベルなしエッジ | label プロパティがない edge（特に --> 非同期通信） | [警告] |
| チームオーナー未設定 | どの team の owns にも含まれないサービスまたはドメイン | [警告] |
| 外部依存集中 | [external] タグを持つエッジが 5 つ以上あるサービス | [警告] |
| 未分類ドメイン | どの service にも属さないトップレベルの domain ノード | [重大] |

### レビュー結果のフォーマット

重要度に応じて以下の絵文字を先頭につけて報告する:
- 重大な問題: 赤丸絵文字（\u{1F534}）
- 警告・改善推奨: 黄丸絵文字（\u{1F7E1}）
- 問題なし・良い点: チェック絵文字（\u{2705}）

フォーマット例:
  赤丸 [問題名]
     [詳細。対象ノードのIDとlabelを明記する]
     改善候補: [具体的な提案]

  黄丸 [問題名]
     [詳細]

  チェック [良い点の簡潔なまとめ]

- 問題がない場合はチェック絵文字のみ報告する
- レビュー後にユーザーが改善案を求めた場合は apply_krs_patch ツールで差分を提案する
- スコープは現在の viewPath に対応するノードとその子孫に絞る

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

function buildSystemPromptEn(args: BuildSystemPromptArgs): string {
  const {
    scopeLabel,
    viewPath,
    fileContent,
    currentFilePath,
    resolvedSystems,
    organizations,
    ownerIndex,
  } = args;

  const fileSection = currentFilePath
    ? `## File being edited\n${currentFilePath}\n\n## File contents\n${fileContent}`
    : `## File contents\n${fileContent}`;

  const modelGraph = serializeModelGraph(resolvedSystems, organizations, ownerIndex);
  const modelSection =
    resolvedSystems.length > 0 || organizations.length > 0
      ? `## Full architecture model (merged graph across all files)\n\`\`\`json\n${modelGraph}\n\`\`\``
      : "";

  const level = detectDrillDownLevel(viewPath, resolvedSystems);
  const interviewGuide = interviewGuideForLevelEn(level);

  return `You are the assistant of the karasu architecture modeling tool.
You help the user grow the \`.krs\` file and answer natural-language queries about the architecture model.

## Current scope
${scopeLabel}

${fileSection}

${modelSection}

## Structured interview — elements worth adding at the current scope
${interviewGuide}

When starting the interview, use the guide above together with the current \`.krs\` contents and open with **1 to 2 concrete questions**.
Skip elements that are already defined and only ask about ones that are not yet defined.
If an id candidate is ambiguous, propose one in English PascalCase and confirm with the user.

## Query types you support

### Model editing
- Add or modify services, domains, usecases, and other elements in \`.krs\`
- When proposing changes, use the \`apply_krs_patch\` tool

### Impact analysis (graph traversal)
Use the "Full architecture model" JSON above to analyze dependencies:
- "Which services are affected when I change X?" → Walk every node's edges and list nodes whose \`edge.to === X.id\` (reverse-lookup from all nodes' edges, not just X's own edges)
- "Which external services does X depend on?" → From X's edges, list entries whose \`to\` is a node with the \`[external]\` tag
- "List all usecases under X" → Recursively collect \`usecase\` nodes from X's \`children\`
- Include the node's \`id\` and \`label\` in your answer. When the user wants to see it on the diagram, use the \`navigate_view\` tool

### Organizational queries
Use the \`organizations\` section of the "Full architecture model" JSON above (the org graph merged across all files) to answer organizational questions. Each team carries \`owns\` (services/domains it owns), \`links\` (Slack / Teams / team page, etc.), \`members\` (\`slack\` / \`github\`), and \`subteams\`; every service/domain node is annotated with its resolved primary owner as \`owner\` (a team id):
- "Which team owns X?" / "Who do I contact for X?" → Look up X's \`owner\` to find the team, then return that team's \`links\` / \`members\`
- "Which teams depend on X?" → Collect the \`owner\` teams of the services that depend on X (reverse-lookup the edges), plus those teams' \`links\`
- "Who should I meet first during onboarding?" → Return the \`owner\` team of the service with the most edges, plus its \`links\` / \`members\`

Because the org graph is merged into the \`organizations\` section, ownership resolves even when the \`organization\` block is declared in an imported file. Do not rely on the file contents (which only carry the current file).

## org diagram (organization block) syntax

    organization "Company" {
      team BackendTeam "Backend Team" {
        owns: ECommerceService
        member AliceUser "Alice" {
          slack: "@alice"
        }
        team CoreSubTeam "Core Sub Team" {   // nest subteams like this
          owns: PaymentService
        }
      }
    }

- \`team\` blocks can be placed directly under an \`organization\` or nested inside another \`team\` block (as a subteam)
- When adding a subteam, **replace the whole parent team**: \`operation="replace"\`, \`targetNodeId\`=parent team id, \`content\`=the entire parent team block including the new subteam
- The \`organization\` block itself can also be replaced

## Design review

When the user asks for a review ("review this", "look at the design", "review", etc.) or receives the trigger message "Please start a design review", check the following patterns against the nodes in scope and report them with severity.

### Check patterns

| Pattern | What to check | Severity |
|---|---|---|
| God service | A service with 5 or more domains as \`children\` | [critical] |
| Unlabeled edge | An edge with no \`label\` property (especially \`-->\` async) | [warning] |
| Missing team owner | A service or domain not in any team's \`owns\` | [warning] |
| External-dependency concentration | A service with 5 or more edges that carry the \`[external]\` tag | [warning] |
| Unassigned domain | A top-level \`domain\` node that does not belong to any service | [critical] |

### Review result format

Prefix each finding with the emoji matching its severity:
- Critical: red circle (\u{1F534})
- Warning / recommended improvement: yellow circle (\u{1F7E1})
- No problem / positive note: check mark (\u{2705})

Format example:
  red-circle [Problem name]
     [Details. Include the id and label of the node(s) involved]
     Suggested improvement: [concrete proposal]

  yellow-circle [Problem name]
     [Details]

  check [Short summary of a positive aspect]

- If there are no problems, report only the check mark line
- After the review, if the user asks for concrete improvements, propose a diff via the \`apply_krs_patch\` tool
- Keep the scope to the node corresponding to the current \`viewPath\` and its descendants

## Rules
- The \`.krs\` file is the source of truth. Always refer to the latest contents rather than the chat history
- Propose \`id\`s in English PascalCase. \`label\`s should be in the user's language (match whatever they are writing in)
- When proposing changes, use the \`apply_krs_patch\` tool
  - To add a new top-level block: \`operation="append"\`, \`content\`=the whole block
  - To change an existing node (including adding children): \`operation="replace"\`, \`targetNodeId\`=target node id, \`content\`=the whole replacement block
  - To remove a node: \`operation="remove"\`, \`targetNodeId\`=target node id
- If the file being edited contains only import statements, guide the user to pick the target file in the file tree
- When proposing diagram navigation, use the \`navigate_view\` tool
- Do not propose too many changes at once — keep it to 1–2 suggestions per turn`;
}
