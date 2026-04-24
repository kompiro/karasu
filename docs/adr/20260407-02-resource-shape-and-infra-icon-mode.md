---
id: ADR-20260407-02
title: resource shape 自動推論とインフラノード Icon Mode 対応
status: accepted
date: 2026-04-07
topic: renderer
depends_on:
  - ADR-20260405-05
  - ADR-20260328-03
scope:
  packages:
    - core
---

# ADR-20260407-02: resource shape 自動推論とインフラノード Icon Mode 対応

- **日付**: 2026-04-07
- **ステータス**: 決定済み
- **関連**: Issue #351, [ADR-20260405-05](20260405-05-database-as-first-class-node.md), [ADR-20260328-03](20260328-03-icon-mode.md)

## 背景

ADR-20260405-05 (#351) で `database` / `queue` / `storage` が System 図にファーストクラスノードとして登場し、`resource OrderDB.OrderTable` のようなドット記法参照が UseCase 図等に現れるようになった。これに伴い 2 つの課題が残っていた：

1. **ドット記法 resource の shape が参照先種別を反映しない** — パーサーが `ref` を付与するがタグは空のままで、`resource[table]` / `resource[queue]` / `resource[storage]` スタイルルールが適用されない
2. **`database` / `queue` / `storage` が Icon Mode で Card 表示されない** — `icon-theme.ts` にエントリがなく、Card 形式の SVG（`queue-card`, `cloud-card`）も存在しない

## 決定

1. **ビュー抽出層でコピーノードを生成**: `extractView()` 内で、タグが空かつ `ref` を持つ `resource` ノードに対して、参照先の sub-resource kind から推論したタグを付与したコピーノードを生成し `childNodes` に含める。`ViewSlice.resourceInferredTagsMap: Map<string, string>` を併設する
2. **kind → タグ名のマッピング**:

   | sub-resource kind | 推論タグ | 既存スタイルルール |
   |---|---|---|
   | `table` | `table` | `resource[table]` |
   | `queue-item` | `queue` | `resource[queue]` |
   | `bucket` | `storage` | `resource[storage]` |

3. **Icon Mode 対応**: `icon-theme.ts` に `database`/`queue`/`storage` 3 エントリを追加（既存の `database.svg`/`queue.svg`/`cloud.svg` を流用）
4. **新規 Card SVG**: `table.svg`、`queue-card.svg`、`cloud-card.svg` を 160×100 Card 形式で新規作成

## 理由

- **ビュー抽出層での補完**: 変更スコープが `view-extract.ts` のみで済み、`resolveStyles()` のインターフェースを変えなくて済む。`resourceLabelMap` / `resourceKindMap` と同じレイヤーで管理できる
- **既存タグ名との整合**: `queue-item` → `queue`、`bucket` → `storage` と既存タグ名にマップすることで、既存の `.krs.style` ルールがそのまま機能する
- **明示タグ優先**: `resource` ノードに明示的なタグが付与されている場合はそれを推論より優先する（ユーザーの意図を尊重）
- **`table.svg` 専用作成**: テーブルは将来 PK 等プロパティを持つ概念に発展する可能性があり、DB（コンテナ）と視覚的に区別する必要がある

## 却下した案

### 案A: `resolveStyles()` で補完（スタイルリゾルバー層）

`resolveStyles(systems, stylesheets, { resourceInferredTagsMap })` のようにインターフェースを変更する案。呼び出し元（app / cli / vscode）すべてに波及するため見送り。
