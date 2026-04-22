# ADR-20260422-02: Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #363, Issue #362, PR #603 (Design Doc), PR #605 (実装)
  - ADR-20260409-08 (`20260409-08-chat-ui-panel.md`) — Chat UI Panel
  - ADR-20260412-01 (`20260412-01-chat-ui-phase3-structured-interview.md`) — Structured Interview
  - Design Doc: `docs/design/chat-ui-design-review.md`（本 ADR で削除）
  - `packages/app/src/hooks/useChatSession/prompt.ts`
  - `packages/app/src/components/ChatPane.tsx`
  - `docs/acceptance/0056-chat-ui-design-review.md`

## 背景

karasu の静的解析（`resolver/warnings.ts`）は「構文的に不正なもの」や明確な構造バグ（ドメイン分散、循環同期依存）を検出して Warning Panel に表示する。しかし次のような **構文的には正しいが設計として問題** のあるパターンは機械検出が難しい:

- ドメインが 10 個以上ある神サービス
- ラベルのないエッジ（意図不明）
- チームオーナー未設定の境界
- 外部依存が集中しているサービス

Chat UI はすでに BYOK（Phase 2）と構造化インタビュー（Phase 3）を持ち、`resolvedSystems` の JSON をシステムプロンプトで AI に渡している。この入り口を活用して、ユーザーが要求したときにオンデマンドで設計レビューを返す機能を追加する。

## 決定

1. **検出ロジックはプロンプトエンジニアリングのみで実現する**（新 props 追加や `analyze()` 再呼び出しはしない）。システムプロンプトに設計レビューパターンと重要度出力形式を記述し、AI が `resolvedSystems` から自律的に検出する。
2. **トリガーはボタン + 自然言語の二系統**。`ChatPane` empty state に「🔍 Start Review」ボタンを追加し、`startInterview()` と同方式の隠しトリガーメッセージを送る。並行して「このモデルをレビューして」のような自然言語入力もシステムプロンプト側でレビューモード起動として解釈する。
3. **レビュースコープは `viewPath` に追従**。常時監視はせず、ユーザー要求時点の現在ドリルダウンレベルのみを対象とする。

## 理由

- **意味的問題の検出こそ AI の強み**。静的解析で既に見える構造的問題の再列挙は副次的であり、Warning Panel と役割を棲み分けた方が UX が明確になる。
- **最小変更**。props threading（案2）や parser 依存の追加（案3）を避け、新しいデータフロー導入ゼロで実装できる。将来「精度が足りない」と判明した時点で段階的に案2 へ移行する余地は残す。
- **`resolvedSystems` JSON が十分な情報量を持つ**。edges の `label` / `kind` / `tags`、children 数、team プロパティを含んでおり、5 つの主要レビューパターンを検出する材料は揃っている。
- **ボタン + 自然言語の二系統**で、機能の発見性（ボタン）と起動の柔軟性（自然言語）を両立する。Start Interview との対称性によって 2 大 AI 機能の並びが明快になる。

## 却下した案

### 案 2: 静的解析 `Warning[]` を props で渡してプロンプトに含める

props threading が `AppShell → EditArea → EditPane → ChatPane → useChatSession` の 4 層に広がる。静的問題の検出精度向上は確かだが、主目的が意味的問題の検出である以上、コスト対効果が低い。将来のバックアップ案として保留。

### 案 3: `useChatSession` 内で `fileContent` を再パースし `analyze()` を呼ぶ

`useChatSession` が parser と `StyleSheet` 解決に依存することになり、hooks 層が core 内部実装に結合する。アーキテクチャコストが高い。

## 実装への影響

- `prompt.ts::buildSystemPrompt()` — レビューパターンと出力フォーマット（重要度付き）を追加。
- `ChatPane.tsx` — empty state に "🔍 Start Review" ボタン、`startReview()` で隠しトリガー送信。
- AT-0056 — レビュー起動と出力フォーマットの手動確認項目。
