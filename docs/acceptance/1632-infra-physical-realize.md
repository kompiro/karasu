# AT: deploy unit が共有 infra ノードを realize できる（store kind）

- **日付**: 2026-06-16
- **関連 Issue**: [#1632](https://github.com/kompiro/karasu/issues/1632)
- **関連 ADR**: [ADR-20260616-09](../adr/20260616-09-infra-physical-realize.md)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`, `packages/core/src/builtins/reference-data.ts`, `packages/core/src/view/deploy-view-extract.ts`

## 受け入れ条件

### 文法・kind

- [x] `store` deploy unit を `type` + `realizes` 付きでパースできる

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `parses a \`store\` deploy unit with type + realizes`

- [x] `store` は `deployUnitKinds` に含まれ、プロパティは `type` / `realizes`（`runtime` は持たない唯一の例外）

  > ✅ Automated — `packages/core/src/builtins/reference.test.ts` › `includes all deploy unit kinds` / `all deploy unit kinds carry a runtime form except \`store\``

### `realizes` の infra 拡張

- [x] `store` が system 内の infra（`database` / `queue` / `storage`）を realize しても `unresolved-realizes` 警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `resolves a \`store\` realizing system-nested infra (database / queue / storage)`

- [x] `store` が top-level（unassigned）の infra を realize しても警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `resolves a \`store\` realizing a top-level (unassigned) infra node`

- [x] 存在しない infra id を realize すると `unresolved-realizes` 警告が出る

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `warns when a \`store\` realizes a non-existent infra id`

- [x] leaf の sub-resource（`table` 等）は realize 対象として解決されない（警告が出る）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `does not resolve a leaf infra sub-resource (table) as a realize target`

### deploy view への描画

- [x] infra を realize する `store` ユニットが、その infra のコンテナ配下にグルーピングされ、ラベルが解決される

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › `forms a container for a \`store\` realizing a system-nested database, with the label resolved`

- [x] top-level infra を realize したときもコンテナのラベルが解決される

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › `resolves the label of a top-level (unassigned) infra realize target`

### 手動確認

- [ ] app で `index.krs` に `database OrderDB {}` と `deploy { store OrderStore { type "Aurora PostgreSQL 15"; realizes OrderDB } }` を書き、deploy view で `OrderStore` が `OrderDB` のコンテナ内に store アイコン（cylinder 系）+ `store` バッジで描画されることを目視確認する

  > ⏳ Manual — SVG 描画の見た目（アイコン / バッジ / コンテナ内配置）はレンダラの結合結果のため目視で確認する
