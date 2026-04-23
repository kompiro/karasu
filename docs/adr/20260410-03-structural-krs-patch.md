---
id: ADR-20260410-03
title: "構造的 `.krs` パッチ — ノード ID ベースの `append` / `replace` / `remove`"
status: accepted
date: 2026-04-10
topic: parser
related_to:
  - ADR-20260409-01
  - ADR-20260409-08
  - ADR-20260412-02
scope:
  packages:
    - core
  domains:
    - patch
    - ast
---

# ADR-20260410-03: 構造的 `.krs` パッチ — ノード ID ベースの `append` / `replace` / `remove`

- **日付**: 2026-04-10
- **ステータス**: 決定済み
- **関連**: Issue #442, [ADR-20260409-01](20260409-01-chat-ui-phase2-byok-ai-integration.md), [ADR-20260409-08](20260409-08-chat-ui-panel.md), [ADR-20260412-02](20260412-02-cli-mutation-subcommands.md)

## 背景

ADR-20260409-01 の Phase 2 実装では、AI の `apply_krs_patch` ツールがスニペットをファイル末尾に追記する（`fileContent + "\n" + patch`）だけだった。これでは以下のユースケースに対応できない：

| ユースケース | 現状 |
|---|---|
| 既存ノードの label/uses を変更 | 末尾に重複ブロックが追記される |
| `system` ブロック内に child service を追加 | 末尾に孤立ブロックが生まれる |
| 不要になったノードを削除 | 削除手段がない |
| 新しいトップレベルブロックを追加 | 現状の append で対応可 |

`KrsNode.loc`（`start.offset` / `end.offset`）が AST に含まれており、ソーステキストへの精密なスプライスが可能な状態にあった。

## 決定

**ノード ID ベースのブロック置換**（案D）を採用し、`append` / `replace` / `remove` の 3 操作を実装する。

### ツールスキーマ

```ts
apply_krs_patch {
  operation: "append" | "replace" | "remove",
  targetNodeId?: string,   // replace / remove 時に必須
  content?: string,        // append / replace 時に必須
  description: string
}
```

| operation | targetNodeId | content | 挙動 |
|---|---|---|---|
| `append` | 不要 | 必須 | 末尾追記（後方互換） |
| `replace` | 必須 | 必須 | ノードをブロックごと置換 |
| `remove` | 必須 | 不要 | ノードとその前後の空白行を削除 |

### `applyKrsPatch` の設計

```ts
function applyKrsPatch(
  source: string,
  operation: PatchOperation,
  targetNodeId?: string,
  content?: string,
): PatchResult
```

**`replace` / `remove`**: `Parser.parse(source)` → `KrsFile.systems` / `.services` / `.domains` を再帰探索して `id === targetNodeId` のノードを発見 → `node.loc.start.offset` / `end.offset + 1` でスライス。`}` トークンの位置は inclusive なので境界は `end.offset + 1`。

**`remove`** の空白処理: 前後の空白行を正規表現で調整し、6 パターンのテストで parse 成功を確認済み。

### 探索対象

`KrsFile.systems`, `.services`, `.domains` を再帰的にたどる（`deploy` / `organization` は対象外）。

### エラーハンドリング

| ケース | 挙動 |
|---|---|
| `targetNodeId` が見つからない | `{ ok: false, error: "Node \"X\" not found" }` |
| `replace` / `remove` で `targetNodeId` 未指定 | エラー返却 |
| `append` / `replace` で `content` 未指定 | エラー返却 |

UI では ChatPane に `⚠ パッチの適用に失敗しました: {error}` を表示。

### `insert-child` は `replace` で代替

親ブロックの閉じ `}` 直前に挿入する専用オペレーションは実装コストが高いため、「親ノード全体を `replace`」で自然に表現する（AI が親ブロック全体を書き直す）。ADR-20260412-02 で CLI の `karasu insert` が `insert-child` オペレーションを追加したが、本 ADR の時点では `replace` で代替する方針だった。

### 実装ファイル

```
packages/app/src/
├── utils/krs-patch.ts         ← applyKrsPatch() 本体
├── utils/krs-patch.test.ts    ← ユニットテスト
└── hooks/useChatSession.ts    ← 新スキーマ対応
```

（後に ADR-20260411-07 で `applyKrsPatch` は `@karasu-tools/core` に移動された）

### システムプロンプト更新

```
- 新しいトップレベルブロックを追加する場合: operation="append", content=ブロック全体
- 既存ノードを変更する場合（child 追加含む）: operation="replace", targetNodeId=対象ノード ID, content=置換後のブロック全体
- ノードを削除する場合: operation="remove", targetNodeId=対象ノード ID
```

## 理由

- **`loc.offset` の活用**: AST にすでに保持されているオフセット情報をそのまま使え、実装がシンプル
- **`append` を残した後方互換性**: Phase 2 の動作を壊さない
- **`insert-child` を `replace` で代替**: 別オペレーションを新設するコストを回避し、AI が親ブロック全体を書き直すパターンで対応できる
- **AI の生成精度**: 構造パッチ（unified diff のような壊れやすい形式ではなく）ノード ID + ブロック全体を返させる方が Claude にとって扱いやすい
- **未変更部分の保護**: 全体置換（案B）は AI が無関係な箇所を誤って変更するリスクがあるが、ノード ID ベースなら対象ノードの範囲に確実に閉じる

## 却下した案

### 案A: Diff/patch 形式（unified diff）

AI が正確な unified diff を生成するのが難しく、インデント・行番号のずれで頻繁に失敗する。ファイルが変更されていると diff の適用自体が壊れる。diff ライブラリの追加依存も必要。

### 案B: ファイル全体置換

実装は最もシンプルだが、大きなファイルでトークン使用量が高く、AI が無関係な箇所を誤って変更するリスクがある。ユーザーが「どこを変えたのか」を確認しづらい。

### 案C: 汎用 AST 対応構造パッチ（`insert-child` を含む 4 オペレーション）

`insert-child` の実装コスト（親ブロックの閉じ `}` 直前への挿入、インデント正規化）が本 ADR の時点では見合わないため、案D の `replace` での代替を採用した。後に ADR-20260412-02 で CLI 側に `insert-child` が追加された。
