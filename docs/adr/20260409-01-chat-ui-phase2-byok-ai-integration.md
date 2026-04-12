# ADR-0028: Chat UI Phase 2 — BYOK + AI 統合の実装方針

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #419, [ADR-0078](20260409-08-chat-ui-panel.md), [ADR-0067](20260407-04-cloudflare-deployment-and-byok-ai.md)

## 背景

Phase 1 (#418) で `LeftTabBar` / `LeftPane` / `ChatPane` の基本構造が実装済みだったが、Phase 2 で BYOK (Bring Your Own Key) と Anthropic API 統合を実装するにあたり、Settings ペインの配置、`useChatSession` フック API、`apply_krs_patch` の `tool_result` 送信タイミングなど実装レベルの決定が未解決だった。

## 決定

1. **Settings ペインは `LeftTabBar` の 3 つ目のタブとして配置**（`editor | chat | settings`）
2. **`useChatSession` フック**は React 側に閉じた Anthropic SDK 呼び出しを担い、`ChatMessage` 型は `user | assistant | error` の 3 種で表現する
3. **`apply_krs_patch` の `tool_result`** は、ユーザーの Apply / Reject 確定後に送信し、AI のフォローアップを得る
4. **パッチ競合検知**は `fileContent` の SHA-256 先頭 8 文字を `contentHashAtProposal` として保持し、Apply 時に現在値と比較する
5. **API キー未設定時**は `ApiKeySetup` プレースホルダーを ChatPane 内に表示し、Settings タブへのボタンで誘導する

## 理由

- **Settings タブ方式**: 左ペインの延長線上にありユーザーが探しやすい。既存グリッド構造への影響が最小で、Chat タブから「Settings で設定してください」とリンクできる。モーダルやインライン表示は既存 UI パターンとの一貫性や責務分離の観点から不採用
- **`tool_result` を確認後に送る**: Anthropic API は `tool_use` の後に `tool_result` のない履歴を送るとエラーを返すため、送らない選択肢は取れない。確認後に送ることで AI が次の提案へとフォローアップできる
- **コンテンツハッシュによる競合検知**: 短時間の比較のみに使うため完全な SHA-256 は不要で、先頭 8 文字で十分な衝突耐性がある

## 却下した案

### ChatPane 内のインライン Settings / モーダルダイアログ

ChatPane の責務が肥大化し、セキュリティ説明など長文コンテンツの表示に向かない。モーダルは既存の UI パターンと一貫性がない。

### `tool_result` を送らず会話を終了する

履歴から `tool_use` を除外するか強制セッションリセットが必要となり、「送らない方がシンプル」という前提が崩れる。

## 未解決（Phase 3 で再検討）

- システムプロンプトへの `fileContent` 埋め込み方式（system メッセージ毎回更新 vs user ターン先頭インジェクト）は Phase 3 設計で再検討する
- `apply_krs_patch` の挿入位置は Phase 2 では末尾追加に限定し、ViewPath 経由の AST 挿入は Phase 3 以降
