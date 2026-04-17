import type Anthropic from "@anthropic-ai/sdk";
import type { SystemNode, KrsNode, KrsEdge, LinkEntry } from "@karasu-tools/core";

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

// ── Content hash ──────────────────────────────────────────────────────────────

export async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const TOOLS: Anthropic.Messages.Tool[] = [
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

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(
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
| チームオーナー未設定 | team プロパティがないサービスまたはドメイン | [警告] |
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
