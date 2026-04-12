# ADR-0029: Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針

- **日付**: 2026-04-12
- **ステータス**: 決定済み
- **関連**: Issue #420, [ADR-0028](0028-chat-ui-phase2-byok-ai-integration.md), [chat-ui-panel.md](../design/chat-ui-panel.md)

## 背景

Chat UI Phase 3 では「ドリルダウンレベル別 system prompt」と「文脈に応じた質問生成」を実現する必要があった。実装レベルでは、`viewPath` からどのレベルに居るかをどう特定するか、Anthropic Messages API が「先頭メッセージは `role: "user"`」を要求する制約の下でチャットタブを開くだけで AI が最初に話しかける UX をどう実現するか、といった設計判断が未解決だった。

## 決定

1. **ドリルダウンレベル検出**は、`viewPath` を `resolvedSystems` 上でトラバースして到達ノードの `kind`（`system | service | domain | usecase`）で判定する
2. **自動インタビュー開始**は、隠しトリガーメッセージ `"インタビューを開始してください。"` を API に送り、AI 応答だけを `messages` state に追加する方式を採る（トリガー自体は UI に表示しない）
3. **`useEffect` deps** は `messages` と `phase` を除外し、`[apiKey, sessionResetKey, startInterview]` のみに絞る。意図は ESLint 無効化コメントで明示する
4. **`viewPath` の伝達**は Context には昇格させず、`AppShell → EditArea → EditPane → ChatPane → useChatSession` のプロップドリリング（4 層）で行う

## 理由

- **末尾ノードの `kind` 判定**: AST 構造を直接参照するため、将来の階層追加（例: `domain` 直下の `resource` 追加）にも強い。`viewPath.length` ベースの機械的判定は階層構造変更で壊れる
- **隠しトリガーメッセージ**: Anthropic API の「先頭は `user` ロール」制約を守りつつ、ユーザーには「AI が自発的に話しかける」UX を提供できる。ボタンクリックを強制する案より UX が優れる
- **deps の絞り込み**: `messages` を deps に入れると `startInterview` が `setMessages` を呼ぶたびに effect が再発火し無限ループとなる。mount 時とプロジェクト切替時（`sessionResetKey` 変化）のみ発火させれば十分
- **プロップドリリング選択**: `viewPath` は既に複数箇所に props で渡されており、Context に昇格させると `useAppContext` の呼び出し側全体に影響する。今回追加した 4 層は許容範囲内

## 却下した案

### `viewPath.length` によるレベル判定

機械的で分かりやすいが、階層構造変更に弱く、長期的に壊れるため不採用。

### ユーザーのボタンクリックによるインタビュー開始

Chat タブを開くだけで始まらず、余分なクリックが必要で UX が低下する。

### `system` prompt だけで AI に最初に喋らせる

`messages` が空または先頭が `assistant` ロールだと Anthropic API がエラーを返すため不可能。
