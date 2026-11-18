---
type: product
---

# AT: usecase から client の local storage を参照できる（#3794）

- **日付**: 2026-11-17
- **関連 Issue**: [#3794](https://github.com/kompiro/karasu/issues/3794)
- **Related TPLs**: [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md), [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md), [TPL-1625](../test-perspectives/TPL-1625-client-vocabulary-structure-not-implementation.md), [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md)
- **対象ファイル**: `packages/core/src/parser/block-contents.ts`, `packages/core/src/spec/infra-index.ts`, `packages/core/src/parser/physical-ref-validation.ts`, `packages/core/src/resolver/resource-entity.ts`, `packages/core/src/view/resource-promotion.ts`, `packages/core/src/view/crud-matrix-extract.ts`, `packages/core/src/view/coverage-extract.ts`, `packages/core/src/compile/client-storage-metadata.ts`, `packages/core/src/renderer/layout-measure.ts`, `packages/app/src/components/NodeDetailPanel.tsx`, `packages/lsp/src/position-resolver.ts`, `packages/cli/src/coverage.ts`

> client の storage の行に省略できる id を付けると（`resource sessionStorage ApiKey "…"`）、
> usecase の `resource <ClientId>.<Id>` がその storage に解決する。以前は KRS048 が
> 「その id の infra ブロックが無い」と警告し、宣言した storage とは何も結びつかなかった。
> 記法は experimental で、言語版は 2.0 のまま。

## 受け入れ条件

### AC-1: id 付きの storage を宣言でき、formatter が保つ

- [x] AT-1: `resource <storageKind> [<Id>] "<name>"` を読み、id の無い行は今までどおり。名前が無いと `expected-string-after`、id の位置のキーワードは `expected-identifier`。後の行の名前は名前として読み、その行がエッジを始めるときは名前にしない。formatter は id（引用符が要るものは引用符付き）を保つ

  > ✅ Automated — `packages/core/src/parser/client-resource-id.test.ts` › `client resource id (#3794)`

### AC-2: `resource <ClientId>.<Id>` が client の storage に解決する

- [x] AT-2: 解決すれば KRS048 は出ない。子が無ければ `unresolved-resource-ref`（`parentKind: "client"`）。トップレベル・別の system・import 先の client にも解決する。infra ブロックと client が同じ id なら infra に解決して `resource-target-ambiguous`。同じ id の client 2 つが子を宣言すると解決しない。entity の `table` は client に解決しない

  > ✅ Automated — `packages/core/src/parser/client-storage-ref-validation.test.ts` › `resource <ClientId>.<Id> (#3794)`

### AC-3: domain ビューは `<name> (<storageKind>)` で描き、detail panel は client と kind を示す

- [x] AT-A: domain ビューの昇格した resource が `karasu.ai.anthropic.apiKey (sessionStorage)` と描かれ、クリックすると panel に `sessionStorage "karasu.ai.anthropic.apiKey" of client WebApp` が出る

  > ✅ Automated — `packages/e2e/tests/at-3794-client-storage-reference.spec.ts` › `the domain view draws the reference as <name> (<storageKind>) and the panel names the client (AT-A)`

- [x] AT-3: カードの幅は描く label で測る（id で測ると長い label がはみ出す）。`service → client` のエッジは導出せず、fan-in と cross-domain store access も client の storage を infra と扱わない

  > ✅ Automated — `packages/core/src/view/client-storage-readers.test.ts` › `client storage readers (#3794)`

### AC-4: client の panel は storage の id と、参照する usecase を示す

- [x] AT-B: client をクリックすると、id のある storage に id と `used by SaveApiKey` が出て、参照されない storage には usecase の行が出ない

  > ✅ Automated — `packages/e2e/tests/at-3794-client-storage-reference.spec.ts` › `the client's panel lists each storage id with the usecases that reference it (AT-B)`

### AC-5: CRUD matrix と coverage に client の storage が載る

- [x] AT-C: CRUD タブに id のある storage ごとの column が `<name> (<storageKind>)` の見出しで出て、参照した usecase の行に `CU` が入る

  > ✅ Automated — `packages/e2e/tests/at-3794-client-storage-reference.spec.ts` › `the CRUD tab has a column per identified client storage (AT-C)`

- [x] AT-4: `karasu coverage` が client ごとの storage の表（`--format json` では `clientStores`）を infra の有無と独立に出し、`karasu matrix` が column の見出しに label を出す。トップレベルの client も届く

  > ✅ Automated — `packages/cli/src/client-storage.test.ts` › `client storages in the CLI (#3794)`

### AC-6: LSP は storage の id を infra の leaf と同じく引ける

- [x] AT-5: 補完の一覧に storage の id が入り、定義へのジャンプが宣言の行に届く

  > ✅ Automated — `packages/lsp/src/client-storage-ids.test.ts` › `client storage ids in the LSP (#3794)`

## 手動確認

N/A — 自動テストですべて覆っている
