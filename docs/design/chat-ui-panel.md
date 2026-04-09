# Chat UI Panel — Structured Interview & Bidirectional Drill-Down

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**:
  - [#362 feat(app): add Chat UI panel](https://github.com/kompiro/karasu/issues/362)
  - [Cloudflare Pages デプロイ基盤と BYOK AI 連携](./cloudflare-deployment-and-byok-ai.md)

## 背景・課題

非自明なアーキテクチャモデリングは、初期設計フェーズで特に難しい。
ユーザーは「システムを自然言語で説明できる」が、`.krs` の構文や構造を知らない段階では白紙のエディタから始めるのが障壁になる。

Chat UI は以下の問題を解決する：

1. **入門障壁の低下**: 構造化インタビューで AI がガイドしながら `.krs` を育てる
2. **ドリルダウン連動**: 図の構造探索とチャットのスコープを双方向に同期させる
3. **エディタとの共存**: Editor タブと Chat タブを切り替えながら同じファイルを編集できる

## 制約・前提

- karasu は純粋なクライアントサイド SPA（サーバーレス）
- AI 呼び出しは BYOK（Bring Your Own Key）: ユーザーが Claude API キーを入力して使う
- `.krs` ファイルが常に source of truth（チャット履歴ではなく）
- `@anthropic-ai/sdk` を `dangerouslyAllowBrowser: true` で使用
- 既存の AppShell グリッドレイアウト（`sidebar | editor | preview`）を踏まえた設計
- `@anthropic-ai/sdk` は現時点で `packages/app/package.json` に未追加

## 現在のレイアウト構造（参考）

```
AppShell
├── [optional] sidebarContent          (grid-column: 1 with sidebar)
├── EditorPane                         (grid-column: 1 or 2 with sidebar)
│     └── Monaco Editor
└── KarasuPreviewColumn                (grid-column: 2 or 3 with sidebar)
      ├── DiagramTabBar (System/Deploy/Org)
      ├── BreadcrumbBar
      ├── PreviewPane
      └── WarningPanel
```

CSS は `display: grid` + クラス切り替え（`has-sidebar`, `sidebar-collapsed`, `preview-focused`）で構成される。

## 検討した選択肢

### 案1: エディタペインをタブ化（左ペイン内でEditor/Chat切り替え）（**採用**）

左ペインに `LeftTabBar`（Editor / Chat タブ）を追加し、
タブ切り替えで EditorPane と ChatPane を切り替える。

```
AppShell
├── [optional] sidebarContent
├── LeftPane                           ← 新設
│     ├── LeftTabBar [Editor | Chat]  ← 新設
│     ├── EditorPane  (tab=editor 時)
│     └── ChatPane    (tab=chat 時)    ← 新設
└── KarasuPreviewColumn
```

`LeftPane` は現在の `EditorPane` と同じグリッド位置（`grid-column: 1` または `2`）を占める。
内部でタブ切り替えを行うため、グリッド構造の変更は最小限。

**メリット**:
- 既存の `AppShell` グリッドへの影響が最小（`EditorPane` を `LeftPane` に置き換えるだけ）
- Editor ↔ Chat の切り替えが自然（同じ幅・高さの領域を共有）
- `hideEditor` prop との整合性が取りやすい

**デメリット**:
- 左ペインに新コンポーネント（LeftPane, LeftTabBar, ChatPane）を追加する必要がある
- `AppShell` の `editorRef` や `handleEditorReady` の受け渡し経路が変わる

---

### 案2: `activeView` を拡張してプレビュー列に Chat を追加

既存の `DiagramTabBar` に Chat タブを追加し、プレビュー列で Chat を表示する。

```
AppShell
├── EditorPane（変更なし）
└── KarasuPreviewColumn
      ├── DiagramTabBar [System | Deploy | Org | Chat]  ← Chat 追加
      └── ... | ChatPane (activeView === "chat" 時)
```

**メリット**:
- `AppShell` のグリッド変更がゼロ
- `activeView` の型拡張のみで状態管理が完結

**デメリット**:
- Chat はエディタと並列ではなくプレビューと並列になる — UX が直感的でない
- 図を見ながらチャットができない（Chat 表示中は図が消える）
- Issue #362 の UI デザイン（左ペインに Editor/Chat タブ）と異なる

---

### 案3: オーバーレイ / ドロワー方式

Chat をフローティングオーバーレイや右ドロワーとして表示する。

**メリット**: 図とチャットを同時に見られる

**デメリット**:
- エディタ・図・チャットの3ペイン同時表示は狭い画面で破綻する
- 既存 CSS との干渉が大きい
- Issue #362 の UI デザインと異なる

---

## 状態管理

### A. `leftTab` をローカル state で管理（**採用**）

`LeftPane` コンポーネント内の `useState` で `"editor" | "chat"` を保持する。
URL ハッシュや `AppState` には含めない。

**理由**:
- ページリロード時にエディタに戻るほうが自然（チャット履歴はセッションメモリ）
- `AppState` を汚さない
- `viewPath`（ドリルダウンスコープ）は既存の `AppState` から props で受け取れる

### B. チャットメッセージ管理

チャット履歴は `ChatPane` コンポーネントのローカル state で管理する（`useState<ChatMessage[]>`）。
`AppState` には含めない。

```ts
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
```

**理由**:
- チャット履歴はセッション限定（`.krs` が source of truth なので永続化不要）
- ファイルを切り替えたらチャット履歴はリセットされる（`currentFilePath` 変化時に `useEffect` でリセット）

### C. ViewPath の双方向連動

`ChatPane` は props で `viewPath: string[]` と `onNavigateViewPath: (path: string[]) => void` を受け取る。

- **Diagram → Chat**: `viewPath` props が変化したらチャットのスコープインジケーターを更新
- **Chat → Diagram**: AI の応答から navigation intent を検出したら `onNavigateViewPath` を呼ぶ

Navigation intent の検出は `tool_use` を利用する（後述）。

---

## BYOK API キー管理

[cloudflare-deployment-and-byok-ai.md](./cloudflare-deployment-and-byok-ai.md) の設計をそのまま踏襲する。

| ストレージ | 用途 |
|---|---|
| `sessionStorage` | API キー本体（デフォルト。タブを閉じたら消える） |
| `localStorage` | API キー本体（ユーザーのオプトインで永続化） |
| `localStorage` | `karasu.ai.settings.persist: "session" \| "local"` |

キーの localStorage キー名: `karasu.ai.anthropic.apiKey`

API キー未入力時は Chat タブを開くと入力フォームを表示する。
入力後はその他のメッセージ入力エリアに遷移する。

---

## AI 統合設計

### SDK 初期化

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: getStoredApiKey(),
  dangerouslyAllowBrowser: true,
});
```

### モデル

`claude-sonnet-4-6`（`claude-sonnet-4-6` は最新の Sonnet）を使用。
将来的にモデル選択 UI を追加できるよう、モデル名は定数として分離する。

### プロンプト設計（ドリルダウンレベル別）

AI は現在の `.krs` ファイルの対象スコープ部分を system prompt で受け取り、
「今のスコープに何が欠けているか」を問いかける構造化インタビューを行う。

| スコープ | AI が質問する内容 |
|---|---|
| system（ルート） | service, user, external system, 依存関係 |
| service | domain, team ownership |
| domain | usecase |
| usecase | resource（ドット記法参照） |

System prompt の構造：

```
あなたは karasu アーキテクチャモデリングツールのガイドです。
ユーザーが .krs ファイルを構造化インタビューで育てるのを支援します。

## 現在のスコープ
{ViewPath を人間が読める形式で表示 e.g. "ECPlatform > ECommerce"}

## 現在の .krs コンテンツ（対象スコープ）
{fileContent または viewPath に対応するノードのサブツリー}

## ルール
- .krs が source of truth。チャット履歴ではなく常にこれを参照する
- id は英語 PascalCase で提案する。label はユーザーの言語で出力する
- 提案する変更は差分形式（追加/変更する .krs スニペット）で示す
- 一度に多くを変更せず、1-2 個の質問に絞る
```

### Tool Use による Navigation 制御

AI がナビゲーションコマンドを自然言語で返すのではなく、
`tool_use` を使って構造化した navigation intent を返す。

```ts
const tools = [
  {
    name: "navigate_view",
    description: "ダイアグラムのドリルダウン位置を変更する",
    input_schema: {
      type: "object",
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
      type: "object",
      properties: {
        patch: {
          type: "string",
          description: "追加・変更する .krs スニペット（ブロック単位）",
        },
        description: {
          type: "string",
          description: "変更内容の説明（ユーザーへの確認メッセージ）",
        },
      },
      required: ["patch", "description"],
    },
  },
];
```

`apply_krs_patch` はユーザー確認（「この変更を適用しますか？」）を挟んでから `handleEditorChange` を呼ぶ。
`navigate_view` は即時に `onNavigateViewPath` を呼ぶ。

---

## 差分適用の方針

`.krs` パッチの適用方式を決める必要がある。

### 案A: ブロック単位の挿入（**採用**）

AI は「追加するブロック」を返す。
既存コンテンツに**末尾追加**または**指定位置に挿入**する。

```krs
// AI が返す patch の例
domain Order {
  label "注文ドメイン"
  usecase PlaceOrder { label "注文する" }
  usecase CancelOrder { label "注文をキャンセルする" }
}
```

クライアント側で `fileContent + "\n" + patch` を適用し、再コンパイルする。
位置指定は ViewPath から挿入先ノードを特定し、そのブロック末尾に挿入する（AST 操作）。

**メリット**: 実装がシンプル。AI への負荷が低い（全体を書き直す必要がない）
**デメリット**: 重複定義が発生する可能性がある（AI が既存ブロックを再提案した場合）

### 案B: 全体書き換え

AI が `.krs` 全体を返す。

**メリット**: 常に整合性が保たれる
**デメリット**: 大きなファイルでトークン消費が多い。ユーザーが手動編集した内容を上書きするリスク

---

## コンポーネント構成

```
packages/app/src/
├── components/
│   ├── AppShell.tsx              (修正: EditorPane → LeftPane に差し替え)
│   ├── LeftPane.tsx              (新設: LeftTabBar + EditorPane or ChatPane)
│   ├── LeftTabBar.tsx            (新設: Editor | Chat タブ)
│   ├── ChatPane.tsx              (新設: メッセージリスト + 入力フォーム)
│   ├── ChatMessage.tsx           (新設: メッセージバブル)
│   └── ApiKeySetup.tsx           (新設: BYOK キー入力フォーム)
├── hooks/
│   └── useChatSession.ts         (新設: AI 呼び出し・メッセージ管理)
└── utils/
    └── api-key-storage.ts        (新設: sessionStorage/localStorage 管理)
```

---

## 比較表

| 観点 | 案1（LeftPane タブ化）| 案2（activeView 拡張）| 案3（オーバーレイ）|
|---|---|---|---|
| Issue #362 UI との一致 | ◎ | △ | △ |
| 図を見ながら操作 | △（Chat 中は図のみ） | × | ◎ |
| グリッド変更量 | 小（EditorPane→LeftPane）| 最小 | 大 |
| 実装複雑度 | 中 | 低 | 高 |
| UX 直感性 | ◎ | △ | ○ |

---

## 現時点の方針

以下の方針で実装する：

1. **レイアウト**: 案1（LeftPane タブ化）を採用
2. **状態管理**: `leftTab` は LeftPane ローカル state、チャット履歴も ChatPane ローカル state
3. **ViewPath 連動**: props 経由で双方向同期
4. **BYOK**: sessionStorage デフォルト、localStorage オプトイン
5. **AI 呼び出し**: `@anthropic-ai/sdk` + tool_use（navigate_view, apply_krs_patch）
6. **差分適用**: ブロック単位追加（案A）+ ユーザー確認ステップ

### 実装フェーズ

**Phase 1**: LeftPane + LeftTabBar + ChatPane（API なし・UI のみ）
- Editor/Chat タブ切り替え
- チャット UI（メッセージリスト + 入力フォーム）
- スコープインジケーター表示
- ViewPath → Chat scope 単方向連動

**Phase 2**: BYOK + AI 統合
- ApiKeySetup コンポーネント
- `api-key-storage.ts` ユーティリティ
- `useChatSession.ts` フック（Anthropic SDK 呼び出し）
- `navigate_view` tool use → diagram navigation
- `apply_krs_patch` tool use → ユーザー確認 → editor 更新

**Phase 3**: 構造化インタビュー
- ドリルダウンレベル別 system prompt
- 文脈に応じた質問生成

---

## 決定事項

### API キーのセキュリティ説明

C レベルの説明を **Settings ペイン**に記載する。
Chat ペインはキー未設定時に Settings への誘導リンクのみ表示し、会話フローを妨げない。

Settings ペインの表示例：
```
⚠ セキュリティについて

このツールは Claude API キーをブラウザ上で直接使用します。
API キーはこのブラウザ内（sessionStorage）にのみ保存され、
外部サーバーには送信されません。

ただし、XSS 攻撃を受けた場合にキーが漏洩するリスクがあります。
Anthropic コンソールで karasu 専用の制限付きキーを発行することを推奨します。
  → console.anthropic.com でキーを管理

[このリスクを理解した上で使用する]
```

### チャット履歴のリセットタイミング

| 状況 | セッション |
|---|---|
| プロジェクト切り替え（ProjectMode） | 新しいセッション |
| ファイル切り替え（同一プロジェクト内） | 継続 |
| MemoryMode | 同一セッション継続 |
| ViewPath 変化 | 継続 |
| ユーザーの手動リセット | 「New Session」ボタンで明示的にリセット |

### 差分適用の競合処理

AI がパッチを提案した時点の `fileContent` のハッシュを保持し、
Apply 押下時に現在の `fileContent` と比較する。
変更を検知したら **Apply ボタンを無効化**し「再生成してください」と表示する。

### ストリーミング

**ストリーミングなし**（一括表示）で実装する。
`tool_use` との複雑な組み合わせを避けるため。将来の改善余地として残す。

### エラーハンドリング

エラー種別で分岐してチャット内インライン表示する：

| エラー | 表示 |
|---|---|
| 401 Unauthorized | `⚠ APIキーが無効です。` + Settings へのリンク |
| 429 Rate Limit | `⚠ リクエスト制限に達しました。` + リトライボタン |
| 500/529 Server Error | `⚠ Anthropic サーバーエラーです。` + リトライボタン |

### Issue の分割

#362 を以下の子 Issue に分割し、それぞれ別 PR でマージする：

- **Phase 1** (#418): LeftPane タブ化 + Chat UI（AI なし）
- **Phase 2** (#419): BYOK + AI 統合（Anthropic SDK + tool_use）
- **Phase 3** (#420): 構造化インタビュー（ドリルダウンレベル別プロンプト）
