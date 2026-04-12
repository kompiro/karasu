# ADR-0078: Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #362, Issue #418, [ADR-0028](0028-chat-ui-phase2-byok-ai-integration.md), [ADR-0029](0029-chat-ui-phase3-structured-interview.md), [ADR-0036](0036-edit-area-and-sidebar-toggle-relocation.md), [ADR-0067](0067-cloudflare-deployment-and-byok-ai.md)

## 背景

非自明なアーキテクチャモデリングは、初期設計フェーズで特に難しい。ユーザーは「システムを自然言語で説明できる」が、`.krs` の構文や構造を知らない段階では白紙のエディタから始めるのが障壁になる。Chat UI は以下を解決することを目指した：

1. **入門障壁の低下**: 構造化インタビューで AI がガイドしながら `.krs` を育てる
2. **ドリルダウン連動**: 図の構造探索とチャットのスコープを双方向に同期させる
3. **エディタとの共存**: Editor タブと Chat タブを切り替えながら同じファイルを編集できる

## 決定

### 1. レイアウト: LeftPane タブ化（案1）

エディタペインを `LeftPane` としてタブ化し、`Editor | Chat | Settings` タブで切り替える。既存の `AppShell` グリッド位置（`grid-column: 1` または `2`）をそのまま占有するため、グリッド構造の変更は最小限。

```
AppShell
├── [optional] sidebarContent
├── LeftPane                           ← 新設
│     ├── LeftTabBar [Editor | Chat | Settings]
│     ├── EditorPane  (tab=editor)
│     ├── ChatPane    (tab=chat)
│     └── SettingsPane (tab=settings)
└── KarasuPreviewColumn
```

> **リネームに関する注記**: 実装後、ADR-0036 の `EditArea` 導入に合わせて `LeftPane` → `EditPane`、`LeftTabBar` → `EditTabBar` にリネームした。本 ADR では元のレイアウト設計を記録するため `LeftPane` の名称を残している。

### 2. 状態管理

- **タブ選択** (`activeTab`): `LeftPane` のローカル `useState`。URL ハッシュや `AppState` には含めない。リロード時に Editor に戻るのが自然、`AppState` を汚さない
- **チャット履歴**: `ChatPane` コンポーネントのローカル state（`useState<ChatMessage[]>`）。`.krs` が source of truth のため永続化不要
- **ViewPath 連動**: `ChatPane` は props で `viewPath` と `onNavigateViewPath` を受け取り、双方向同期する

### 3. ViewPath の双方向連動

- **Diagram → Chat**: `viewPath` props が変化したらチャットのスコープインジケーターを更新
- **Chat → Diagram**: AI の応答から navigation intent を `tool_use`（`navigate_view`）で検出し `onNavigateViewPath` を呼ぶ

### 4. BYOK API キー管理（ADR-0067 を踏襲）

| ストレージ | 用途 |
|---|---|
| `sessionStorage` | API キー本体（デフォルト） |
| `localStorage` | API キー本体（ユーザーオプトインで永続化）|
| `localStorage` | `karasu.ai.settings.persist: "session" \| "local"` |

キー: `karasu.ai.anthropic.apiKey`。API キー未設定時は ChatPane 内に `ApiKeySetup` プレースホルダーを表示し Settings タブへ誘導する。

### 5. Tool Use による Navigation / Patch 制御

AI はナビゲーションやパッチ適用を自然言語ではなく `tool_use` で返す：

| ツール | 用途 | 処理 |
|---|---|---|
| `navigate_view` | ドリルダウン位置の変更 | 即時 `onNavigateViewPath` 呼び出し |
| `apply_krs_patch` | `.krs` への変更適用 | ユーザー確認（Apply / Reject）後に `handleEditorChange` |

### 6. 差分適用: ブロック単位追加（案A）

AI は「追加するブロック」を返し、クライアント側で `fileContent + "\n" + patch` として末尾追加する（Phase 2 時点）。位置指定は ViewPath から挿入先ノードを特定する AST 操作で Phase 3 以降に拡張する。

### 7. コンポーネント構成

```
packages/app/src/
├── components/
│   ├── AppShell.tsx              (修正)
│   ├── LeftPane.tsx              (新設 → 後に EditPane.tsx へリネーム)
│   ├── LeftTabBar.tsx            (新設 → 後に EditTabBar.tsx へリネーム)
│   ├── ChatPane.tsx              (新設)
│   ├── ApiKeySetup.tsx           (新設)
│   └── SettingsPane.tsx          (新設)
├── hooks/
│   └── useChatSession.ts         (新設)
└── utils/
    └── api-key-storage.ts        (新設)
```

### 8. 決定済みの細部

- **API キーのセキュリティ説明**: Settings ペインに C レベル説明を集約し、Chat ペインは未設定時に Settings への誘導リンクのみ表示する
- **チャット履歴のリセットタイミング**: プロジェクト切替時・手動 "New Session" 時はリセット、ファイル切替・ViewPath 変化は継続
- **差分適用の競合処理**: パッチ提案時点の `fileContent` の SHA-256 先頭 8 文字を保持し、Apply 時に現在値と比較して変更を検知したら Apply ボタンを無効化（ADR-0028 で詳細化）
- **ストリーミング**: なし（一括表示）。`tool_use` との複雑な組み合わせを避けるため。将来の改善余地として残す
- **エラーハンドリング**: 401 / 429 / 500 を種別ごとにインライン表示（詳細は ADR-0028）

### 9. Issue 分割と Phase 別設計の所在

本 ADR は Phase 1（UI 骨格）の設計と Phase 2/3 の方針を記録する。Phase 2/3 の実装詳細は個別 ADR を参照：

| Phase | Issue | ADR |
|---|---|---|
| Phase 1（LeftPane タブ化 + Chat UI shell、AI なし） | #418 | 本 ADR |
| Phase 2（BYOK + AI 統合、Anthropic SDK + tool_use） | #419 | [ADR-0028](0028-chat-ui-phase2-byok-ai-integration.md) |
| Phase 3（構造化インタビュー、ドリルダウンレベル別プロンプト） | #420 | [ADR-0029](0029-chat-ui-phase3-structured-interview.md) |

## 理由

- **LeftPane タブ化（案1）**: 既存の `AppShell` グリッドへの影響が最小（`EditorPane` を `LeftPane` に置き換えるだけ）で、Editor ↔ Chat の切り替えが自然（同じ幅・高さの領域を共有）。Issue #362 の UI デザインとも一致する
- **ローカル state での `activeTab` 管理**: リロード時に Editor に戻る挙動が自然で、`AppState` を汚さない。`viewPath` は既存の `AppState` から props で受け取れるため state 追加は不要
- **チャット履歴の非永続化**: `.krs` が source of truth なのでセッション限定で十分。ファイル切替時のリセットも自然
- **`tool_use` による構造化 navigation**: 自然言語からナビゲーション意図を抽出する脆い処理を避け、Anthropic API のネイティブ機能で意図を構造化できる
- **ブロック単位追加（案A）**: 実装がシンプルで AI への負荷も低い。全体書き換え（案B）は大きなファイルでトークン消費が多く、手動編集内容を上書きするリスクもある

## 却下した案

### 案2: `activeView` を拡張してプレビュー列に Chat を追加

既存の `DiagramTabBar` に Chat タブを追加する案。グリッド変更ゼロで済むが、Chat がエディタと並列ではなくプレビューと並列になり UX が直感的でない。図を見ながらチャットができず、Issue #362 の UI デザインとも異なる。

### 案3: オーバーレイ / ドロワー方式

Chat をフローティングオーバーレイや右ドロワーとして表示する案。図とチャットを同時に見られる利点はあるが、エディタ・図・チャットの 3 ペイン同時表示は狭い画面で破綻する。既存 CSS との干渉も大きい。

### 案B: 差分適用の全体書き換え

AI が `.krs` 全体を返す案。常に整合性が保たれる利点はあるが、大きなファイルでトークン消費が多く、ユーザーの手動編集内容を上書きするリスクがある。
