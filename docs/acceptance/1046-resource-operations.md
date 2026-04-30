---
type: product
---

# AT-1046: Resource CRUD operations property on usecases

- **日付**: 2026-04-30
- **関連 Issue**: [#1046](https://github.com/kompiro/karasu/issues/1046)
- **対象ファイル**:
  - `packages/core/src/lexer/lexer.ts`
  - `packages/core/src/types/tokens.ts`
  - `packages/core/src/types/ast.ts`
  - `packages/core/src/parser/parser.ts`
  - `packages/core/src/parser/diagnostic-legacy-format.ts`
  - `packages/core/src/spec/operations.ts`
  - `packages/app/src/i18n/{types,en,ja,format-diagnostic}.ts`
  - `docs/spec/syntax.md`, `docs/spec/syntax.ja.md`
  - `examples/feature-samples/resource-operations.krs`
  - `examples/ec-platform/03-domains.krs`, `packages/core/src/builtins/examples.ts`
- **関連 Design Doc**: [resource-crud-operations.md](../design/resource-crud-operations.md)（マージ後 ADR に昇格予定）

## 受け入れ条件

- [x] AT-A: `usecase` 内の `resource` ブロックで `operations create, read` が parse でき、AST の `properties.operations` に `["create", "read"]` が入る
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `accepts CRUD verbs on a resource inside a usecase`

- [x] AT-B: 複数行の `operations` 行が累積される（`operations create` の後に `operations read, update` を書くと AST 上 `["create", "read", "update"]`）
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `accumulates verbs across multiple operations lines`

- [x] AT-C: `operations` を省略しても警告は出ず、AST の `properties.operations` は `undefined`
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `emits no diagnostic when operations is omitted`

- [x] AT-D: 認識セット外の verb（例: `fetch`）は `unknown-resource-operation` warning を発行するが、AST には保持される
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `warns on unknown verbs but preserves them on the AST`

- [x] AT-E: 同一 verb の重複は `duplicate-resource-operation` warning を発行し、AST 上では 1 度だけ残る
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `warns on duplicate verbs and dedupes them on the AST`

- [x] AT-F: `resource` 以外のブロック（`usecase` 直下など）に `operations` を書くと `property-not-for-node-kind` error
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `rejects operations on non-resource nodes`

- [x] AT-G: `[external]` タグ付き resource と `operations` を併用しても `unassigned-resource` warning は出ない（既存挙動を壊さない）
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `accepts CRUD verbs on a resource inside a usecase`（[external] 併用ケースを使用）

- [x] AT-H: `examples/feature-samples/resource-operations.krs` と `examples/ec-platform/03-domains.krs` が diagnostics ゼロで parse できる
  > ✅ Automated — `packages/core/src/builtins/examples.test.ts`（既存の examples スモーク）

- [ ] AT-I（manual）: `docs/spec/syntax.md` および `syntax.ja.md` に `operations` の構文・認識セット・省略時セマンティクスが追加されている
  > 🧑 Manual — 本 PR の spec 差分をレビューして、recognized table と omission 説明が ja/en で一致しているかを目視確認

- [ ] AT-J（manual）: Preview で `examples/ec-platform/03-domains.krs` を開いたとき、`OrderTable` 等を選んだ `NodeDetailPanel` の Properties セクションに `operations` が表示される（または、表示されないなら follow-up issue を起票する）
  > 🧑 Manual — 現状 NodeDetailPanel が `properties.operations` をどう表示するかを観察し、表示が無ければ v2 の renderer 拡張で扱う旨を確認する（design doc の "renderer は無変更" 方針との整合）

## 補足

`operations` は controlled vocabulary（`create` / `read` / `update` / `delete`）として扱うが、認識セット外の verb は AST に保持して translate アダプタの拡張余地を残している。`list` / `search` / `execute` を v1 認識セットに追加するかは別 Issue で議論する。
