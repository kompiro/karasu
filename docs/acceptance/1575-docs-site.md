# AT-1575: Documentation site built from docs/ (Astro Starlight, Phase 1)

- **日付**: 2026-06-16
- **関連 Issue**: [#1575](https://github.com/kompiro/karasu/issues/1575)
- **関連 Design Doc / ADR**: [docs-site SSG 選定](../design/docs-site-ssg.md)（Astro Starlight 採用）
- **Related TPLs**: [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（link/anchor 未解決をビルドで fail）, [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（doc ↔ source 片方向同期）
- **対象**:
  - `packages/docs-site/`（`astro.config.mjs`, `src/content.config.ts`, `scripts/sync.ts`, `scripts/check-links.ts`, `scripts/lib/{site-map,rewrite,markdown}.ts`, `home/{en,ja}.md`）
  - `.github/workflows/pages.yml`
  - `docs/spec/tags-annotations.ja.md`（壊れていた ja アンカーの修正）

## 概要

`docs/`（guides 01–05 / spec syntax・style・tags-annotations / concepts、en + ja）を single source of truth として Astro Starlight のドキュメントサイトを生成する。ビルド時に `docs/` から content collection を sync し、repo-relative リンクと明示アンカーをサイト URL（in-site は base-agnostic な route-relative、サイト外は GitHub URL）へ書き換え、未解決の in-site link/anchor があればビルドを fail させる。`krs` / `krs.style` の fence は vscode の TextMate grammar を Shiki に渡してハイライトする。

## 受け入れ条件

### AC-1: docs/ をサイトのルート / コンテンツパスへ正しく対応づける（single source of truth）

- [x] `.md`→en・`.ja.md`→ja、`README`→セクション index、ja は `ja/` 配下、というルート/コンテンツパス対応が一貫している
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `site-map` › `maps docs paths to slugs` / `maps docs paths to routes (ja prefixed, trailing slash, no leading slash)` / `maps docs paths to content-collection paths (ja under ja/, README -> index)`
- [x] ページ間リンクは base path（`/karasu/`）に依存しない route-relative URL になる
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `site-map` › `computes base-agnostic relative routes`

### AC-2: repo-relative リンクと明示アンカーがサイト上で解決する（TPL-20260616-01）

- [x] in-site のクロスセクションリンクが route-relative URL へ書き換わり、`#anchor` は保持される
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `rewriteLinkTarget` › `rewrites in-site cross-section links route-relative` / `preserves anchors on in-site links`
- [x] language-switcher リンクが対向ロケールのルートへ書き換わる
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `rewriteLinkTarget` › `rewrites a language-switcher link to the ja locale route`
- [x] `examples/` とサイト外 `docs/*.md` へのリンクは GitHub tree/blob URL になり、外部 / ページ内リンクは無改変
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `rewriteLinkTarget` › `rewrites examples/ links to GitHub tree URLs` / `rewrites out-of-site docs/*.md links to GitHub blob URLs` / `leaves external and in-page links untouched`
- [x] コードフェンス内の `](...)` は書き換え対象にしない
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `rewriteBody` › `rewrites links in prose but never inside code fences`
- [x] 見出し slug（`github-slugger`）と明示 `<a id>` をアンカーとして収集し、H1 はタイトル化して本文から除く（TPL-20260616-01）
  > ✅ Automated — `packages/docs-site/scripts/lib/rewrite.test.ts` › `markdown helpers` › `collects heading slugs and explicit anchors, skipping code fences` / `extracts and strips the first H1 as the title`
- [x] 未解決の in-site link / アンカーがあるとビルドが fail する（TPL-20260616-01）
  > ✅ Automated — `packages/docs-site/scripts/check-links.ts`（`pnpm --filter @karasu-tools/docs-site run build` および `.github/workflows/pages.yml` で実行。本 PR で `docs/spec/tags-annotations.ja.md` の壊れた `#client-capability` を検出・修正済み）

### AC-3: bilingual な公開とハイライト（手動確認）

- [ ] guides 01–05・spec（syntax/style/tags-annotations）・concepts が en・ja の両方でビルドされ到達できる（`pnpm --filter @karasu-tools/docs-site run build` → 23 ページ生成、`astro preview` で確認）
- [ ] language switcher で同一ページの en ↔ ja を往復でき、サイドバーが Guides / Reference / Concepts を両ロケールで表示する
- [ ] `krs` / `krs.style` の fence が vscode grammar 由来でシンタックスハイライトされる（`data-language="krs"` ブロックがトークン色付けされる）

### AC-4: デプロイと home（手動 / CI 確認）

- [ ] `.github/workflows/pages.yml` が SSG をビルドして `packages/docs-site/dist` を GitHub Pages にデプロイし、トリガが `docs/**` + `packages/docs-site/**` + 自身に広がっている
- [ ] 既存ランディングを引き継ぐ splash home が base URL（en）と `ja/`（ja）でレンダリングされ、Guides / Reference へ導線がある

## 検証方法

- 自動: `pnpm --filter @karasu-tools/docs-site run test`（13 ケース）、`pnpm --filter @karasu-tools/docs-site run check-links`（in-site link/anchor 解決）。両者は root の `test` / `test:coverage` チェーンとビルドに組み込み済み。
- 手動: `pnpm --filter @karasu-tools/docs-site run build && pnpm --filter @karasu-tools/docs-site run preview` でローカル起動し、AC-3 / AC-4 を目視確認する。
