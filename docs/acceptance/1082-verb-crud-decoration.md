---
type: product
---

# AT-1082: Verb-decoration syntax for usecase resource operations (1:N CRUD mapping)

- **日付**: 2026-05-03
- **関連 Issue**: [#1082](https://github.com/kompiro/karasu/issues/1082)
- **対象ファイル**:
  - `packages/core/src/lexer/lexer.ts` (`:` を Colon トークンとして emit)
  - `packages/core/src/parser/parser.ts` (`parseOperationsList` / `parseOneOperation` / 装飾 RHS バリデーション)
  - `packages/core/src/parser/parser.test.ts`
  - `packages/core/src/parser/diagnostic-legacy-format.ts`
  - `packages/core/src/spec/operations.ts` (`ResourceOperation` 型 + `isWriteOperation` 改訂)
  - `packages/core/src/spec/operations.test.ts`
  - `packages/core/src/types/ast.ts` (`ResourceNode.properties.operations` を `ResourceOperation[]` に変更 + 3 新規 diagnostic コード)
  - `packages/core/src/view/crud-matrix-extract.ts`
  - `packages/core/src/view/crud-matrix-extract.test.ts`
  - `packages/core/src/formatter/formatter.ts` (`renderOperations`)
  - `packages/core/src/formatter/formatter.test.ts`
  - `packages/app/src/i18n/{en,ja,types,format-diagnostic}.ts`
  - `docs/spec/syntax.md` § Verb-decoration syntax
  - `examples/en/feature-samples/crud-matrix.krs`
- **関連 ADR**: [ADR-20260503-01](../adr/20260503-01-verb-crud-decoration.md)（本機能の決定）, [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` プロパティ — 本機能はその syntax 拡張）, [ADR-20260502-01](../adr/20260502-01-crud-matrix-view.md)（CRUD マトリクスビューが consumer）

## 受け入れ条件

- [x] AT-A: `operations list:read, search:read, create` が parse でき、`ResourceOperation[]` として `[{ verb:"create" }, { verb:"list", decoratedAs:["read"] }, { verb:"search", decoratedAs:["read"] }]` が AST に格納される（順序は宣言順）
  > ✅ Automated — `parser.test.ts` › `accepts verb decoration ...`

- [x] AT-B: 1:N 装飾 `replace:create,delete` が parse でき、`{ verb:"replace", decoratedAs:["create","delete"] }` が AST に格納される
  > ✅ Automated — `parser.test.ts` › `accepts 1:N decoration verb:c1,c2`

- [x] AT-C: Q1.1 ルール（`verb:` 後の RHS は次の `<id>:` 境界まで継続）に従い、`search:read,create, list:read` が `search:[read,create]` と `list:[read]` に分割される
  > ✅ Automated — `parser.test.ts` › `groups CRUD continuations until the next verb: boundary`

- [x] AT-D: 装飾 RHS に CRUD 以外の verb（`list:bogus`）が来ると `invalid-crud-decoration` error が出る
  > ✅ Automated — `parser.test.ts` › `emits invalid-crud-decoration when RHS is not a CRUD verb`

- [x] AT-E: 空 RHS（`list:`）に対して `empty-crud-decoration` error が出る
  > ✅ Automated — `parser.test.ts` › `emits empty-crud-decoration when RHS is empty`

- [x] AT-F: 重複 RHS（`replace:create,create`）に対して `duplicate-crud-decoration-target` warning が出て、AST 上で重複排除される
  > ✅ Automated — `parser.test.ts` › `emits duplicate-crud-decoration-target on replace:create,create`

- [x] AT-G: 装飾済み verb には `unknown-resource-operation` warning が出ない（`list:read` は warning なし）
  > ✅ Automated — `parser.test.ts` › `accepts verb decoration ...` の warnings.length === 0 検証

- [x] AT-H: `isWriteOperation` が装飾を読む — `list:read` は false、`replace:create,delete` は true、bare `read:read`（装飾あり）は false
  > ✅ Automated — `spec/operations.test.ts` › `respects decoration` 系 3 ケース

- [x] AT-I: CRUD マトリクスの cell が装飾を反映 — `list:read` は `R`（`R?` ではない）、`replace:create,delete` は `CD` で write 扱い + ΣC/ΣD 両方インクリメント
  > ✅ Automated — `crud-matrix-extract.test.ts` › `decorated verb (list:read)` / `decorated 1:N (replace:create,delete)`

- [x] AT-J: `karasu fmt` が装飾を `verb:c,d`（スペースなし）形式で emit し、idempotent（再 format で diff なし）
  > ✅ Automated — `formatter.test.ts` › `resource operations` 内 2 ケース

- [ ] AT-K（manual）: `karasu matrix examples/en/feature-samples/crud-matrix.krs --format=md` を実行し、`SearchOrders` の cell が `R`（`R?` ではない）であること、`ReplaceOrderSnapshot` の cell が `CD` で OrderTable の ΣC / ΣD カラムにそれぞれ +1 されていることを目視確認する
  > 🧑 Manual — terminal 出力で確認

- [ ] AT-L（manual）: `examples/en/feature-samples/crud-matrix.krs` を `karasu fmt` にかけて、装飾済み行（`operations read, list:read` / `operations replace:create,delete`）が形を保ったまま戻ってくることを目視確認する
  > 🧑 Manual — `karasu fmt examples/en/feature-samples/crud-matrix.krs` を `--check` 付きで diff ゼロを確認

- [ ] AT-M（manual）: app の preview で `feature-samples/crud-matrix.krs` を開き、CRUD タブで `ReplaceOrderSnapshot` の cell が write 強調背景になっていること、unknown verbs 脚注が消えていることを目視確認する
  > 🧑 Manual — preview の Matrix タブで確認

## 補足

- `translate openapi` / `translate db` の `--emit-crud-decoration` フラグは本 PR のスコープ外。両 translator が現状 `usecase` 内 `resource` を emit していないため、装飾以前に「usecase→resource bindings を emit する」機能が必要になる。これは別 Issue として切り出す。
- `@karasu-tools/core` の `ResourceNode.properties.operations` は `string[]` から `ResourceOperation[]` への breaking change。core が pre-1.0 / npm 未公開のうちに入れる前提で進めた（design doc Q3 に明記）。
- 1:N 乱用への lint warning は **入れない**（spec/docs ガイドラインのみ）。Design doc Q5 の方針に従う。
