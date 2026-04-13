# Chat UI — AI 設計レビュー（Issue #363）

- **日付**: 2026-04-13
- **ステータス**: 承認済み
- **関連**: Issue #363, Issue #362, [ADR-20260409-08](../adr/20260409-08-chat-ui-panel.md), [ADR-20260412-01](../adr/20260412-01-chat-ui-phase3-structured-interview.md)

## 背景・課題

karasu の静的解析（`packages/core/src/resolver/warnings.ts`）はすでに構造的な問題
（ドメイン分散、循環同期依存など）を検出してWarning Panelに表示している。
しかし、これは**構文的に正しいが設計として問題のある**パターンを検出できない。例：

- ドメインが 10 個以上ある「神サービス」（God service）
- ラベルのないエッジ（`-->` 非同期通信なのに意図が不明）
- チームオーナーが未設定のサービス/ドメイン
- 外部依存が集中しているサービス

Issue #363 は Chat UI にこの**オンデマンド AI 設計レビュー**機能を追加する。
ユーザーがチャットでレビューを依頼すると、AI が現在のスコープを分析して
構造的・意味的な問題を重要度付きで報告する。

## 制約・前提

- Chat UI Phase 2（BYOK）と Phase 3（構造化インタビュー）が実装済みである
- `resolvedSystems: SystemNode[]` として解析済みモデルグラフがすでに ChatPane に渡っている
- 静的解析の `analyze()` は `KrsFile` AST を引数にとるため、`useChatSession` から
  直接呼び出すには現在の props 範囲では難しい
- レビューはリアルタイムではなくオンデマンド（常時監視は authoring フローを妨げる）
- スコープは `viewPath` に追従する（現在のドリルダウンレベル）

## 検討した選択肢

### 案1: プロンプトエンジニアリングのみ（静的解析なし）

AI はすでにシステムプロンプトで渡されている `resolvedSystems` の JSON 全体から
自身でパターンを検出する。

```
system prompt に追加:
## 設計レビューパターン
- 神サービス: domain が 5 つ以上のサービス
- ラベルなしエッジ: label プロパティのないエッジ
- チームオーナー未設定: team プロパティのないサービス/ドメイン
- 外部依存集中: [external] エッジが 5 つ以上のサービス
- 未分類ドメイン: service に属さないトップレベル domain
...（重要度・フォーマット指示も含む）
```

**メリット**
- 実装がシンプル（新しい props/データ流なし）
- AI が model graph JSON から自律的にパターンを検出できる
- `apply_krs_patch` ツールと連携した改善提案まで自然にフォールスルーする

**デメリット**
- すでに `analyze()` で機械的に検出できる問題（ドメイン分散、循環依存）を
  AI が重複して「再発見」する可能性がある
- AI の検出精度は確率的であり、閾値（「5 つ以上」など）の判断がばらつく恐れがある

---

### 案2: 静的解析 warnings をプロンプトに含める

`useChatSession` に `systemWarnings: Warning[]` prop を追加し、
`buildSystemPrompt` 内でシリアライズして AI に渡す。

```
system prompt に追加:
## 静的解析の検出結果（WarningPanel と同じ情報）
[
  { kind: "domain-dispersal", message: "...", details: [...] },
  { kind: "cyclic-dependency", message: "...", details: [...] }
]
AI はこれらを参照したうえで、上記では検出できない意味的な問題も加えて報告する。
```

props threading: `AppShell → EditArea → EditPane → ChatPane → useChatSession`

**メリット**
- 静的解析で確実に検出できる問題（ドメイン分散など）の精度が高い
- AI は「機械が既に検出したもの + 機械では検出できないもの」と整理しやすい
- Warning Panel との一貫性が保たれる

**デメリット**
- 警告の props threading が 4 層になる（ただし `viewPath` のときと同等の変更量）
- `Warning[]` が空の場合と null の扱いを全層で考慮する必要がある

---

### 案3: `useChatSession` 内で `analyze()` を呼ぶ

`fileContent` を core パッケージのパーサーで再解析し、`analyze()` を呼び出して
warnings を取得してからプロンプトに含める。

**メリット**
- 新しい props が不要（`fileContent` はすでにある）

**デメリット**
- `useChatSession` に parser 依存が増える（hooks が core の内部実装に依存）
- `analyze()` は `KrsFile`（AST）と `StyleSheet[]` を引数にとるため、
  `fileContent` から再パースする処理を hooks 内に書く必要がある
- スタイルシートの解決（`StyleSheet[]`）が現在 `useChatSession` のスコープ外

## 比較

| 観点 | 案1（プロンプトのみ） | 案2（warnings prop） | 案3（内部で analyze） |
|---|---|---|---|
| 実装コスト | ✅ 低 | 🟡 中（4 層 props threading） | ❌ 高（parser 依存） |
| 静的問題の精度 | 🟡 確率的 | ✅ 機械的に確実 | ✅ 機械的に確実 |
| 意味的問題の検出 | ✅ AI の得意領域 | ✅ AI の得意領域 | ✅ AI の得意領域 |
| アーキテクチャへの影響 | ✅ なし | 🟡 props threading 追加 | ❌ hooks が parser に依存 |
| 将来の拡張性 | 🟡 閾値変更はプロンプト修正 | ✅ 静的 / AI 役割分担が明確 | 🟡 |

## 現時点の方針

**案1（プロンプトエンジニアリングのみ）**を採用する方針。

理由:
- AI 設計レビューの主目的は「静的解析では検出できない意味的な問題の検出」であり、
  すでに Warning Panel で可視化されている構造的問題の再列挙は副次的である
- `resolvedSystems` の JSON はすでに edges の `label`、`kind`、`tags` および
  children の数を含んでおり、5 つの AI レビューパターンを検出するのに十分な情報がある
- 案2 の精度向上は有用だが、まず案1 で実装し AI の検出精度を検証してから
  案2 への移行を判断するのが段階的に正しい

---

## トリガー方式（決定済み）

**案A（ボタン + 自然言語の両対応）**を採用する。

- `ChatPane` の empty state に "▶ Start Interview" と並んで "🔍 Start Review" ボタンを追加
- ユーザーがチャットで "このモデルをレビューして" などと入力した場合も同じレビューフローに入る
  - system prompt 内にレビュー依頼の検出指示を含め、AI が自動的にレビューパターン分析モードで応答する
- ボタンクリック時は `startReview()` 関数で隠しトリガーメッセージを送信（`startInterview()` と同方式）

```
┌─────────────────────────────────────────────────┐
│  [▶ Start Interview]  [🔍 Start Review]          │
│  現在のスコープについて AI がインタビュー形式で   │
│  質問します。または自由に入力してください。       │
└─────────────────────────────────────────────────┘
```

**理由**: 機能の発見性を確保しつつ、入力欄から自然言語でも起動できる柔軟性を持たせる。
Start Interview との対称性を保つことで 2 つの主要 AI 機能が明確に並ぶ。
