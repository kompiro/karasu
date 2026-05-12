---
type: product
---

# AT-1340: Reference single source — Phase 2 (Tags / deploy-unit / form-factor tables)

- **日付**: 2026-05-12
- **関連 Issue**: [#1340](https://github.com/kompiro/karasu/issues/1340)（親 [#1328](https://github.com/kompiro/karasu/issues/1328) / [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts`（`Tag.defaultEffect` 追加、`Tag.formFactor?` を 7 client タグに追加）
  - `scripts/reference/gen-docs.ts`（`tags` / `client-form-factor-tags` / `deploy-unit-kinds` テーブル追加）
  - `docs/spec/tags-annotations.md` / `.ja.md`（`## Tags` テーブルを `<!-- gen:reference:tags -->` 区間に）
  - `docs/spec/syntax.md` / `.ja.md`（`#### client form-factor tags` テーブルを `<!-- gen:reference:client-form-factor-tags -->` 区間に、deploy-unit テーブルを `<!-- gen:reference:deploy-unit-kinds -->` 区間に）
- **設計**: [docs/design/reference-from-spec.md](../design/reference-from-spec.md)
- **TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)

## 受け入れ条件

- [ ] AT-A: クリーンな checkout で `pnpm gen:reference --check` が exit 0（コミット済みの生成テーブルが最新）
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `the committed spec docs are up to date`

- [ ] AT-B: `reference-data.ts` の tags / deployUnitKinds を書き換えて `pnpm gen:reference` を実行すると、`tags-annotations.md` / `syntax.md`（+ `.ja.md`）の対応マーカー区間が更新され、区間外の散文（`## Tags` の note blockquote、`### Physical structure` の「全プロパティ省略可」注記、form-factor 表周辺の散文）は不変
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `applyBlock replaces only the marked region and leaves surrounding prose intact` / `blockFor renders a GFM table wrapped in matching markers` / `every table has en + ja files, headers, and a non-empty body`

- [ ] AT-C: `## Tags` テーブルが 16 行（resource tags `[table]` / `[queue]` / `[api]` / `[storage]` を含む）になり、`#### client form-factor tags` テーブルが `formFactor` を持つ 7 タグのみ、deploy-unit テーブルの Properties 列が `label` を除いた `properties` になる
  > ✅ Automated — `scripts/reference/gen-docs.test.ts`（`rows()` の行数・列数を担保）+ in-sync チェック（コミット済みテーブルが上記どおりであることを担保）

- [ ] AT-D（manual）: `docs/spec/tags-annotations.md` / `tags-annotations.ja.md` / `syntax.md` / `syntax.ja.md` を開き、`<!-- gen:reference:tags -->` / `<!-- gen:reference:client-form-factor-tags -->` / `<!-- gen:reference:deploy-unit-kinds -->` 区間のテーブルが Markdown としてレンダリング上崩れていない（ヘッダ・罫線・コードスパン・日本語が正しい）ことを目視確認する
  > 🧑 Manual — 生成された Markdown テーブルの目視確認。`--check` で内容の一致は担保するが、レンダリング結果は目視で確認する
