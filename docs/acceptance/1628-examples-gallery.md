# AT-1628: Examples gallery (docs site, build-time rendering)

- **日付**: 2026-06-16
- **関連 Issue**: [#1628](https://github.com/kompiro/karasu/issues/1628)（docs site Phase 2 — Examples gallery 項目）
- **関連設計**: `docs/design/docs-site-examples-gallery.md`（実装完了後 ADR に昇格）
- **Related TPLs**: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（docs 取り込みパイプライン）, [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（正典 ↔ 派生の片方向）
- **対象**:
  - `packages/docs-site/scripts/lib/{examples-manifest,render-examples,gallery-pages}.ts`
  - `packages/docs-site/scripts/sync.ts`（gallery 生成を追加）
  - `packages/docs-site/astro.config.mjs`（"Examples" サイドバー）

## 概要

`examples/` を single source of truth に、docs サイトのビルド時（sync）に各 example を `compileProject` で SVG レンダリングし、コード + 図を併置した gallery ページ群（index + 各 example ページ、en/ja）を生成する。SVG はコミットしない（毎ビルド派生）。どのビュー（system/deploy/org）を出すかは compile 結果から自動選択し、空ビューは出さない。

## 受け入れ条件

### AC-1: examples のビルド時レンダリング

> ✅ Automated by `packages/docs-site/scripts/lib/render-examples.test.ts` (suite-wide)

- [x] manifest の全 example（single-file / multi-file）が例外なくコンパイルでき、ソースが読める
- [x] 各 example が **1 つ以上の非空ビュー** を生成する（`<svg` を含み十分な長さ）
- [x] multi-file（`multi-file-system`）が `import` 解決込みでレンダリングできる

### AC-2: gallery ページ生成

- [x] index ページが README 同様 3 群（getting-started / scenarios / feature-samples）でグルーピングし、全 example へリンクする（en/ja）
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `index lists every page grouped, in both locales`
- [x] single-example ページが各ビューを **data-URI img**（SVG の id 衝突回避・base 非依存）で埋め込み、entry ソースを `krs` fence で示し、GitHub ソースリンクを持つ
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `single-example page embeds the view as a data-URI img with a source fence`
- [x] `feature-samples` ページが各サンプルを section（見出し + 図 + コード）で縦並びにする
  > ✅ Automated — `packages/docs-site/scripts/lib/gallery-pages.test.ts` › `feature-samples page renders one section per sample`

### AC-3: 空ビュー非表示（自動選択）

- [x] `org-only` は Org ビューのみ、`deploy-only` は Deploy ビューのみ、system を持つ example は System（+ 該当すれば Deploy/Org）を出す
  > ✅ Automated — `packages/docs-site/scripts/lib/render-examples.test.ts`（view 自動選択。空ビューは push されない）

### AC-4: 公開・体裁（手動確認）

- [ ] `/examples/` と各 `/examples/<slug>/` が en・ja の両方でビルド・到達でき、サイドバーに "Examples" 群（Overview + 各ページ）が出る
- [ ] 各ページで図（SVG）が表示され、ソースが `krs` ハイライトされる
- [ ] index の各リンクが対応する example ページへ解決する（en/ja とも）

## 検証方法

- 自動: `pnpm --filter @karasu-tools/docs-site run test`（render smoke + gallery-pages、PR CI に乗る）。
- 手動: `pnpm --filter @karasu-tools/docs-site run build && pnpm --filter @karasu-tools/docs-site run preview` で `/examples/` を目視（AC-4）。
