---
id: ADR-20260503-01
title: usecase resource operations に verb 装飾構文（1:N CRUD マッピング）を追加する
status: accepted
date: 2026-05-03
topic: parser
related_to:
  - ADR-20260430-03
  - ADR-20260502-01
scope:
  packages:
    - core
    - app
assumptions:
  - "file: packages/core/src/parser/parser.ts"
  - "file: packages/core/src/spec/operations.ts"
  - "file: packages/core/src/lexer/lexer.ts"
  - "symbol: packages/core/src/spec/operations.ts :: ResourceOperation"
  - "symbol: packages/core/src/spec/operations.ts :: isWriteOperation"
---

# ADR-20260503-01: usecase resource operations に verb 装飾構文（1:N CRUD マッピング）を追加する

- **日付**: 2026-05-03
- **ステータス**: 決定済み
- **実装**: PR #1100（Issue #1082）
- **関連**:
  - Design Doc: [verb-crud-decoration.md](../design/verb-crud-decoration.md)（昇格元）
  - ADR-20260430-03: usecase 内 resource の `operations` プロパティ — 本 ADR はその syntax 拡張
  - ADR-20260502-01: CRUD マトリクスビュー — 装飾済み verb を消費して `?` suffix を消す
  - 受け入れテスト: `docs/acceptance/1082-verb-crud-decoration.md`
  - 仕様: `docs/spec/syntax.md` § Verb-decoration syntax

## 背景

ADR-20260430-03 の recognized set は `create` / `read` / `update` / `delete` の 4 種で、それ以外の verb（`list` / `search` / `enqueue` / `replace` …）は AST に保持されつつ `unknown-resource-operation` warning が出ていた。ADR-20260502-01 のマトリクスビューはそれを `R?` のような `?` suffix で表示し、ユーザーに「CRUD verb で書き直して」と誘導していた。

しかし現実には、

- `list` / `search` は意味的には `read`
- `enqueue` / `publish` は `create`
- `replace` / `upsert` は **`create` + `delete`**（物理 delete-insert）

といった「CRUD には落とせるがドメイン語彙では別 verb で呼びたい」シーンがある。`read` 等への書き換えはドメイン語彙を失い、translate アダプタの round-trip を破壊し、1:N（`replace` → C+D）が `update` で潰れて分析精度が下がる。

## 決定

`operations` プロパティに **`<verb>:<crud>[,<crud>...]`** という装飾構文を追加する。

```krs
operations list:read, search:read           // 1:1
operations enqueue:create, dequeue:delete   // queue idioms
operations replace:create,delete            // 1:N (delete-insert)
operations create, list:read                // bare + 装飾の混在
```

### 構造

- **構文**: `verb:crud[,crud]`、識別子フル形式（`list:read`、`replace:create,delete`）。`:` は karasu 本体パーサーで未使用だったため衝突なし。
- **AST**: `ResourceNode.properties.operations` を `string[]` から `ResourceOperation[]`（`{ verb, decoratedAs? }`）への **breaking change**。`@karasu-tools/core` が pre-1.0 のうちに入れる。
- **1:N 解釈ルール（Q1.1）**: 一度 `verb:` を見たら、次の `<id>:` 境界 or リスト末尾までのカンマ区切り識別子を CRUD-RHS として消費する。`search:read,create, list:read` → `search:[read,create]`, `list:[read]`。bare verb を後置したい場合は装飾より前に置く。
- **`isWriteOperation`**: `decoratedAs` を優先的に読み、なければ bare verb の recognized 判定にフォールバック。`list:read` は not write、`replace:create,delete` は write。
- **マトリクスビュー**: 装飾済み verb は recognized 集合に寄与し、`?` suffix を出さない。1:N 装飾は複数 ΣC/R/U/D カラムにそれぞれカウント。
- **fmt**: 装飾右辺はスペースなし（`verb:c,d`）。verb 区切りカンマと CRUD 区切りカンマを視覚的に分離。
- **Diagnostic codes**:
  - `invalid-crud-decoration`（error）: RHS が CRUD verb 以外
  - `empty-crud-decoration`（error）: RHS が空（`list:`）
  - `duplicate-crud-decoration-target`（warning）: RHS で同じ CRUD verb が重複
  - 既存の `unknown-resource-operation` は装飾済み verb には出さない
- **Lint**: 過剰装飾（単純な in-place 書き換えに `:create,delete` を使う）への warning は **入れない**。spec / docs のガイドラインのみで対応。

## 理由

- **`:` 区切りは衝突なし** で karasu 本体に新記号を入れるコストが小さい。`->` はエッジ構文と被り、`[]` はノードタグと被る。
- **識別子フル形式** で装飾なし形式と語彙が一貫し、ユーザーが「装飾は短縮形」と誤解しない。
- **構造化 AST** にすることで解釈ロジックを parser に集約。`isWriteOperation` / matrix / fmt が個別に文字列を再 parse する重複を排除。
- **Lint を出さない** ことで false positive を避けつつ、ガイドラインで方向性を示す。乱用が顕在化したら後付け可能。
- **`unknown-resource-operation` を装飾済みでは出さない** ことで、装飾を入れたユーザーへの「警告で報われる」体験を担保。

## 却下した案

### `->` 構文（`verb -> crud`）

`A -> B` のエッジ構文と意味階層が違うのに同じ記号を使うことになり、可読性が下がる。

### `[crud]` 構文（`verb [crud]`）

`[external]` などのノードタグと表記が同じになり、意味階層が崩れる。

### 1 文字 CRUD shorthand（`verb:R`）

装飾なし形式の語彙（`create` / `read` / ...）と割れる。1 文字 identifier は将来的なノード命名と衝突する余地がある。

### `string[]` のまま consumer 側で再 parse

解釈ロジックが複数箇所に散らばり、バグの温床になる。型レベルで装飾あり/なしが見えない。

### 過剰装飾への lint warning

false positive のリスクが大きく、ユーザーの意図表明を override する形になる。spec のガイドラインで足りる範囲。

### translate adapter のデフォルトで自動装飾

既存ユーザーの `.krs` 出力フォーマットが変わり、無用な diff を生む。装飾構文の習熟前に default 化するのは早い。

## Follow-up

- **translate adapter `--emit-crud-decoration` flag** — `karasu translate openapi` / `db` が現状 `usecase` → `resource` バインディング自体を emit していないため、装飾以前に「バインディング emit」機能が必要。本 ADR のスコープ外として別 Issue で扱う。
