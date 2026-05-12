---
type: product
---

# AT-1341: Reference single source — Phase 2 (node-kind tables)

- **日付**: 2026-05-12
- **関連 Issue**: [#1341](https://github.com/kompiro/karasu/issues/1341)（親 [#1328](https://github.com/kompiro/karasu/issues/1328) / [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts`（`NodeKindData.layer` 追加、`table` / `queue-item` / `bucket` を `nodeKinds` に追加、`infraLayerLabel?` / `infraIntendedUse?` 追加）
  - `scripts/reference/gen-docs.ts`（`node-kinds-logical` / `node-kinds-infra` テーブル追加）
  - `docs/spec/syntax.md` / `.ja.md`（`### Logical structure` を `<!-- gen:reference:node-kinds-logical -->` 区間に、`### Infra layer` を `<!-- gen:reference:node-kinds-infra -->` 区間に）
  - `packages/core/src/builtins/reference.test.ts` / `reference-spec-sync.test.ts`（leaf kinds 反映）
- **ADR**: [ADR-20260512-03](../adr/20260512-03-reference-data-single-source.md)
- **TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)

## 受け入れ条件

- [ ] AT-A: クリーンな checkout で `pnpm gen:reference --check` が exit 0（コミット済みの生成テーブルが最新）
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `the committed spec docs are up to date`

- [ ] AT-B: `getReference().nodeKinds` が leaf kinds `table` / `queue-item` / `bucket` を末尾に含む（13件）。各 entry は `en` / `ja` 両方の非空 description を持つ
  > ✅ Automated — `packages/core/src/builtins/reference.test.ts` › `includes all node kinds (logical + infra blocks + infra leaves)` / `packages/core/src/builtins/reference-data.test.ts`（en/ja parity）

- [ ] AT-C: `### Logical structure` テーブルは `layer === "logical"` の 7 種のみ、`### Infra layer` テーブルは infra 系 6 種（3 ブロック + 3 leaf）で、両者の keyword はすべて `getReference().nodeKinds` に存在する
  > ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts` › `syntax.md: every logical-structure node kind is in getReference().nodeKinds` / `syntax.md: every Infra layer keyword (blocks + leaf sub-resources) is in getReference().nodeKinds` + `gen-docs.test.ts` の in-sync チェック

- [ ] AT-D（manual）: `docs/spec/syntax.md` / `syntax.ja.md` を開き、`### Logical structure` と `### Infra layer` の `<!-- gen:reference:* -->` 区間のテーブルが Markdown としてレンダリング上崩れていない（ヘッダ・罫線・コードスパン・日本語が正しい）こと、`### Logical structure` 直後の「`client` の form-factor タグは下表参照」の案内文が表示されることを目視確認する。あわせて Reference パネルの Syntax タブに `table` / `queue-item` / `bucket` の 3 行が表示されることも確認する
  > 🧑 Manual — 生成された Markdown テーブルと Syntax タブの目視確認。`--check` で内容の一致は担保するが、レンダリング結果は目視で確認する
