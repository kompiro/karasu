# Chat UI Phase 2 — BYOK + AI Integration 実装設計

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**:
  - [#419 feat(app): Chat UI panel — Phase 2: BYOK + AI integration](https://github.com/kompiro/karasu/issues/419)
  - [chat-ui-panel.md](./chat-ui-panel.md) — レイアウト・状態管理・ツール設計の上位設計
  - [cloudflare-deployment-and-byok-ai.md](./cloudflare-deployment-and-byok-ai.md) — BYOK ストレージ方針

## 背景・課題

`chat-ui-panel.md` は Phase 2 の設計方針（BYOK、tool use、エラーハンドリング等）を概説しているが、
以下の実装レベルの決定が未解決のまま残っている：

1. **Settings ペインの配置場所** — `chat-ui-panel.md` に「Settings ペイン」の記述はあるが、LeftTabBar のタブとするか、別の UI（モーダル、ドロワー等）にするかが明示されていない
2. **`useChatSession` フックの API 設計** — パラメーター・戻り値・内部の型定義
3. **Phase 2 のシステムプロンプト** — Phase 3（構造化インタビュー）の前段として、Phase 2 では何をシステムプロンプトに含めるか
4. **ApiKeySetup → Settings のナビゲーションフロー** — キー未設定時の UI 遷移

---

## 制約・前提

- Phase 1（#418）で `LeftTabBar`（`editor | chat`）、`LeftPane`、`ChatPane` の基本構造が実装済み
- `AppShell` に `handleEditorChange`・`navigateViewPath`・`fileContent`・`viewPath` がすでに存在する
- ストリーミングなし（一括表示）— `tool_use` との複雑な組み合わせを避けるため（`chat-ui-panel.md` 決定済み）
- `@anthropic-ai/sdk` は `packages/app` に未追加（Phase 2 で追加する）

---

## 論点1: Settings ペインの配置

### 案A: LeftTabBar に Settings タブを追加（**採用**）

`editor | chat | settings` の 3 タブ構成にする。

```
LeftPane
├── LeftTabBar [✏ Editor | 💬 Chat | ⚙ Settings]
├── EditorPane   (tab=editor 時)
├── ChatPane     (tab=chat 時)
└── SettingsPane (tab=settings 時)  ← 新設
```

SettingsPane には以下を含める：
- BYOK セキュリティ説明（XSS リスク・sessionStorage/localStorage の説明）
- API キー入力フォーム（新規入力・変更・削除）
- 「セッションをまたいで保存する」チェックボックス

**メリット**:
- 左ペインの延長線上にあるため、ユーザーが探しやすい
- `LeftTabBar` のタブとして追加するだけ — 既存のグリッド構造に影響なし
- Chat タブから「Settings で設定してください」とリンクできる

**デメリット**:
- タブが 3 つになり、ペイン幅によっては窮屈になる可能性がある

---

### 案B: ChatPane 内に Settings インライン表示

ChatPane の上部に折りたたみ式の Settings セクションを組み込む。

**メリット**: 遷移なしにキー設定できる

**デメリット**:
- ChatPane の責務が大きくなりすぎる
- セキュリティ説明などの長いコンテンツを折りたたみで表示するのは UX として劣る

---

### 案C: モーダルダイアログ

Settings ボタンをツールバーに追加し、クリックするとモーダルを開く。

**デメリット**:
- 既存の CSS・コンポーネント構成に対してモーダルのオーバーレイが複雑
- 既存の UI パターンと一貫性がない

---

**結論**: 案A（LeftTabBar に Settings タブ追加）を採用する。

---

## 論点2: `useChatSession` フックの API 設計

### インターフェース

```ts
// メッセージ型
interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
}

interface AssistantChatMessage {
  id: string;
  role: "assistant";
  content: string;
  // apply_krs_patch tool_use が含まれる場合
  patch?: {
    description: string;
    patch: string;
    contentHashAtProposal: string; // fileContent の SHA-256（先頭 8 文字）
  };
}

interface ErrorChatMessage {
  id: string;
  role: "error";
  errorType: "auth" | "rate_limit" | "server";
  content: string;          // ユーザー向けメッセージ
  retryMessageId?: string;  // リトライ対象のユーザーメッセージ ID
}

type ChatMessage = UserChatMessage | AssistantChatMessage | ErrorChatMessage;

// フックのパラメーター
interface UseChatSessionParams {
  fileContent: string;
  viewPath: string[];
  apiKey: string | null;
  onNavigateViewPath: (path: string[]) => void;
  onEditorChange: (value: string) => void;
  sessionResetKey: string | null;
}

// フックの戻り値
interface UseChatSessionReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  retryMessage: (userMessageId: string) => Promise<void>;
  applyPatch: (assistantMessageId: string) => void;
  resetSession: () => void;
}
```

### contentHashAtProposal の生成

パッチ提案時点の `fileContent` と現在の `fileContent` を比較することで競合を検知する。
SHA-256 の完全ハッシュではなく、先頭 8 文字を切り出して使用する（比較のみが目的であるため）。

```ts
async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}
```

`applyPatch` 呼び出し時に `patch.contentHashAtProposal !== hashContent(currentFileContent)` であれば Apply を無効化する。

### エラーハンドリング

| SDK エラー | errorType | ChatPane 表示 |
|---|---|---|
| `status === 401` | `"auth"` | `⚠ APIキーが無効です。` + Settings タブへのリンク |
| `status === 429` | `"rate_limit"` | `⚠ リクエスト制限に達しました。` + リトライボタン |
| `status >= 500` | `"server"` | `⚠ Anthropic サーバーエラーです。` + リトライボタン |
| その他の例外 | `"server"` | `⚠ 予期しないエラーが発生しました。` + リトライボタン |

`@anthropic-ai/sdk` の `APIError` は `status` フィールドを持つ。それ以外の例外は `"server"` として扱う。

---

## 論点3: Phase 2 のシステムプロンプト

Phase 3 では「ドリルダウンレベル別の構造化インタビュー」プロンプトを導入するが、
Phase 2 では汎用的なアシスタントプロンプトを使用する。

```
あなたは karasu アーキテクチャモデリングツールのアシスタントです。
ユーザーが .krs ファイルを育てるのを支援します。

## 現在のスコープ
{scopeLabel}  ← breadcrumb 形式（例: "EC Platform > EC サイト"）

## 現在の .krs コンテンツ
{fileContent}

## ルール
- .krs が source of truth。チャット履歴ではなく常に最新の内容を参照する
- id は英語 PascalCase で提案する。label はユーザーの言語（日本語可）で出力する
- 変更を提案する場合は apply_krs_patch ツールを使用する
- ダイアグラムのナビゲーションを提案する場合は navigate_view ツールを使用する
- 一度に多くを変更せず、1-2 個の提案に絞る
```

`fileContent` はリクエストごとに最新の状態を渡す（チャット履歴の `system` は更新できないため、
`user` ターンの最初に「最新の .krs」として差し込む方式も検討余地あり — 今は都度 system に含める）。

---

## 論点4: ApiKeySetup → Settings へのナビゲーションフロー

### フロー

1. ユーザーが Chat タブを開く
2. `getStoredApiKey()` が `null` を返す
3. `ChatPane` の代わりに `ApiKeySetup` コンポーネントを表示する
4. `ApiKeySetup` に「⚙ Settings で設定する」ボタンを配置
5. ボタンクリック → `LeftPane` が `activeTab` を `"settings"` に切り替える

```tsx
// ChatPane が受け取る props に onNavigateToSettings を追加
interface ChatPaneProps {
  // ...既存 props...
  onNavigateToSettings: () => void;  // ← 新規追加
}

// ApiKeySetup コンポーネント（ChatPane 内部でレンダリング）
<ApiKeySetup onGoToSettings={onNavigateToSettings} />
```

`LeftPane` 側で `activeTab` を `"settings"` に切り替えるコールバックを渡す。

### `ApiKeySetup` の表示内容

```
⚙ Claude API キーが必要です

karasu の AI 機能を使うには Anthropic の API キーが必要です。

[⚙ Settings で設定する]
```

シンプルに Settings タブへ誘導するのみ。詳細な説明（XSS リスク等）は Settings ペインに集約する。

---

## コンポーネント・ファイル構成

```
packages/app/src/
├── components/
│   ├── AppShell.tsx          (修正: viewPath・navigateViewPath・fileContent を LeftPane に渡す)
│   ├── LeftPane.tsx          (修正: Settings タブ + SettingsPane + ChatPane に追加 props)
│   ├── LeftTabBar.tsx        (修正: "settings" タブ追加)
│   ├── ChatPane.tsx          (修正: useChatSession 統合・ApiKeySetup 表示・パッチ確認 UI)
│   ├── ApiKeySetup.tsx       (新設: キー未設定時のプレースホルダー)
│   └── SettingsPane.tsx      (新設: セキュリティ説明 + API キー管理)
├── hooks/
│   └── useChatSession.ts     (新設: Anthropic SDK 呼び出し・tool_use・エラー処理)
└── utils/
    └── api-key-storage.ts    (新設: sessionStorage/localStorage 管理)
```

---

## 未解決の問い

1. **システムプロンプトのファイルコンテンツ更新タイミング**: 毎リクエストで `system` に最新 `fileContent` を含める方針だが、これはリクエストごとに system が変わる = 履歴との整合性が取れなくなる懸念がある。`messages` の先頭に「現在の .krs を添付した user ターン」を毎回インジェクトする方式の方が履歴整合性は高い — Phase 3 設計時に再検討する。

2. **`apply_krs_patch` の挿入位置**: 設計では「末尾追加」を基本としているが、ViewPath を使って挿入先ノードを特定する AST 操作も `chat-ui-panel.md` に言及がある。Phase 2 では末尾追加（`fileContent + "\n" + patch`）に限定し、Phase 3 以降で精度を上げる。
