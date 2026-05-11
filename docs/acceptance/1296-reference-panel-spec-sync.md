---
type: product
---

# AT-1296: Reference panel ↔ docs/spec sync (edge / layout style properties)

- **日付**: 2026-05-11
- **関連 Issue**: [#1296](https://github.com/kompiro/karasu/issues/1296)
- **対象ファイル**:
  - `packages/core/src/builtins/reference.ts`
  - `packages/core/src/builtins/reference-spec-sync.test.ts`
  - `packages/app/src/components/ReferencePanel.test.tsx`
  - `docs/test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md`
- **TPL**: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md), [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) item 5

## 受け入れ条件

- [ ] AT-A: `getReference()` の `styleProperties` に `direction` / `label-position` / `label-offset` / `column` が含まれ、`en` / `ja` 両 locale で `description` が解決される
  > ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts` › `style.md: every documented style property is in getReference().styleProperties` および `packages/core/src/builtins/reference.test.ts`（全 styleProperties が non-empty description を持つことを担保）

- [ ] AT-B: `docs/spec/style.md` の `css` 宣言ブロック / shape テーブル、`docs/spec/tags-annotations.md` の Tags / Annotations テーブル、`docs/spec/syntax.md` の Logical structure テーブルに記述された keyword は、すべて `getReference()` の対応データに存在する（spec → reference の片方向 subset）
  > ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts`（5 ケース）

- [ ] AT-C: spec doc に新しい style プロパティを足して `reference.ts` に追記しないと、上記 smoke test が失敗する（回帰リハーサル）
  > ✅ Automated — `reference-spec-sync.test.ts` の `missing` assertion がこれを担保（実装時に `column` 等が欠けている状態で test が赤くなることを確認済み）

- [ ] AT-D: Reference パネルの **Styles タブ**を開くと、Style Properties テーブルに `direction` / `label-position` / `label-offset` / `column` の行が description 付きで表示される
  > ✅ Automated — `packages/app/src/components/ReferencePanel.test.tsx` › `Styles tab lists the edge / layout style properties from the spec`

- [ ] AT-E（manual）: アプリ（`pnpm dev`）で `index.krs` を開き、Reference パネル → Styles タブで上記 4 プロパティの行が表示され、説明文が読めることを目視確認する。locale を `ja` に切り替えて日本語の説明文が出ることも確認する
  > 🧑 Manual — UI レンダリングの目視確認。RTL test で文字列の存在は担保しているが、テーブル内での見え方（折り返し等）は目視で確認する
