---
type: product
---

# AT-1334: Reference single source — Phase 2 (codegen spec-doc tables)

- **日付**: 2026-05-12
- **関連 Issue**: [#1334](https://github.com/kompiro/karasu/issues/1334)（親 [#1328](https://github.com/kompiro/karasu/issues/1328) / [#1296](https://github.com/kompiro/karasu/issues/1296)）
- **対象ファイル**:
  - `scripts/reference/gen-docs.ts`（新規 — codegen）
  - `scripts/reference/gen-docs.test.ts`（新規）
  - `packages/core/src/builtins/reference-data.ts`（`Annotation.defaultRendering` / `Shape.typicalUse` 追加）
  - `docs/spec/tags-annotations.md` / `.ja.md`（Annotations テーブルを `<!-- gen:reference:annotations -->` 区間に）
  - `docs/spec/style.md` / `.ja.md`（shape テーブルを `<!-- gen:reference:shapes -->` 区間に）
  - `lefthook.yml` / `.github/workflows/ci.yml`（`gen:reference --check` の配線）
- **設計**: [docs/design/reference-from-spec.md](../design/reference-from-spec.md)
- **TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)

## 受け入れ条件

- [ ] AT-A: クリーンな checkout で `pnpm gen:reference --check` が exit 0（コミット済みの生成テーブルが最新）
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `the committed spec docs are up to date`

- [ ] AT-B: `reference-data.ts` の annotations / shapes を書き換えて `pnpm gen:reference` を実行すると、対応するマーカー区間（`tags-annotations.md` / `style.md` + `.ja.md`）のテーブルが更新され、区間外の散文は不変
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `applyBlock replaces only the marked region and leaves surrounding prose intact` / `blockFor renders a GFM table wrapped in matching markers`

- [ ] AT-C: マーカー区間が無い content に対して `applyBlock` が失敗する（= 区間を消すと codegen が壊れたことに気づける）
  > ✅ Automated — `scripts/reference/gen-docs.test.ts` › `applyBlock throws when the markers are missing`。マーカー区間内を手編集した場合は `pnpm gen:reference --check` が exit 1（lefthook `reference-docs-check` / ci.yml `Reference docs in sync` で実行）

- [ ] AT-D（manual）: `docs/spec/tags-annotations.md` / `tags-annotations.ja.md` / `style.md` / `style.ja.md` を開き、`<!-- gen:reference:* -->` 区間の Annotations / shape テーブルが Markdown としてレンダリング上崩れていない（ヘッダ・罫線・コードスパン・日本語が正しい）ことを目視確認する
  > 🧑 Manual — 生成された Markdown テーブルの目視確認。`--check` で内容の一致は担保するが、レンダリング結果は目視で確認する
