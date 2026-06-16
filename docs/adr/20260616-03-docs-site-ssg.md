---
id: ADR-20260616-03
title: "docs/ を single source of truth として Astro Starlight でドキュメントサイトを生成する"
status: accepted
date: 2026-06-16
topic: build
related_to:
  - ADR-20260616-02
  - ADR-20260425-01
  - ADR-20260420-03
  - ADR-20260407-04
scope:
  concerns:
    - ci
    - i18n
assumptions:
  - "file: packages/docs-site/astro.config.mjs"
  - "file: packages/docs-site/scripts/check-links.ts"
  - "grep: .github/workflows/pages.yml :: docs-site"
---

# ADR-20260616-03: docs/ を single source of truth として Astro Starlight でドキュメントサイトを生成する

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **Issue**: [#1575](https://github.com/kompiro/karasu/issues/1575)
- **関連**:
  - 設計 PR [#1616](https://github.com/kompiro/karasu/pull/1616)、実装 PR [#1621](https://github.com/kompiro/karasu/pull/1621)
  - [ADR-20260616-02](./20260616-02-guide-embedded-diagrams.md) — 正典から再掲を生成し drift gate で縛る同系統の判断（guide diagrams）
  - [ADR-20260425-01](./20260425-01-i18n-default-policy.md) / [ADR-20260420-03](./20260420-03-i18n-rollout.md) — `.md` = en / `.ja.md` = ja の i18n ポリシー
  - [ADR-20260407-04](./20260407-04-cloudflare-deployment-and-byok-ai.md) — PR preview の Cloudflare デプロイ（docs サイトとは別系統）
  - [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)（link/anchor 未解決をビルドで fail）、[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（doc ↔ source 片方向同期）
  - コード: `packages/docs-site/`, `.github/workflows/pages.yml`

## 背景

ガイド 5 章・syntax/style/tags リファレンス・concepts がすべて `docs/` 配下の markdown として揃った一方、公開面の `site/` は手書きの単一ランディングページで、`pages.yml` は `site/` をビルドなしでアップロードしているだけだった。bilingual なガイド／リファレンス群がサイト上で読めず、`docs/` を single source of truth に保ったままナビゲーション・i18n・`krs` シンタックスハイライト・検索を備えたドキュメントサイトへ育てる必要があった。

主たる論点は (1) 静的サイトジェネレータ（SSG）の選定と、(2) `docs/` の markdown をフォークせずにサイト化するコンテンツパイプラインの方針。`docs/` は GitHub 素読み前提で repo-relative リンク（`../spec/syntax.md`）と明示アンカー（`<a id>` / 見出し slug）を使っており、これを取り込み先 URL 体系へ書き換える link/anchor 解決が最大の技術リスクだった。

## 決定

SSG に **Astro Starlight** を採用し、`packages/docs-site/`（新 workspace）として `docs/` から content collection をビルド時に生成する。Phase 1 のスコープはガイド 01–05・spec（syntax/style/tags-annotations）・concepts の bilingual 公開とする。

## 理由

- 評価軸で重みの大きい **i18n**・**Shiki custom grammar**・**検索** がすべて first-class。Pagefind 同梱、locale ルーティング・language switcher 標準、`krs` / `krs.style` の TextMate grammar（`packages/vscode/syntaxes/*`）を Shiki に渡してハイライトできる。
- ドキュメント UX が電池込み（サイドバー・ToC・前後ナビ）で、手書き switcher を標準へ寄せられる。React island により Phase 2 の `@karasu-tools/app`（React）playground 埋め込みも最も素直。
- 3 案とも「`docs/` を複製せず取り込む」ために **ビルド時の content sync + リンク／アンカー書き換え**が必要で、ここは SSG の差では解消されない。最も上物の強い Starlight を選び、sync は自前で持つ。
- ページ間リンクは GitHub Pages の base path（`/karasu/`）を埋め込まず **route-relative** で出すことで base 非依存にし、base のハードコードによる一括 404 を避ける。サイト外（`examples/` / ADR / 外部）へのリンクは GitHub URL に落とす。
- link/anchor の未解決を **ビルド時に fail させる**ガード（`check-links`）を proactive TPL（[TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md)）として同梱。実際に ja の壊れたアンカー（`#client-capability` → `#client-の-capability`）を検出した。見出し slug は本番（rehype-slug）と同じ `github-slugger` で算出する。
- Astro / Starlight は private package の **devDependencies** とし、production license スキャン（`--prod`）の対象外に保つ。

## 却下した案

- **VitePress** — 最軽量・最も Vite ネイティブだが、テーマ／コンポーネントが Vue で Phase 2 の React playground 埋め込みが不利。ドキュメント UX も Starlight ほど電池込みではない。
- **Docusaurus** — React ベースだが Webpack 依存で repo の Vite tooling から外れ、ハイライトが Prism 既定で `krs` grammar 流用が遠い。i18n も翻訳 dir 構造で co-located `.md` / `.ja.md` 規約からの距離が最大。Phase 1 スコープには過剰。

## 決めなかったこと（Phase 2 以降）

- examples gallery + rendered diagram 埋め込み（#1574 / ADR-20260616-02 の SVG 消費）、`@karasu-tools/app` の playground 埋め込み、versioned docs。
- 手書き language switcher の Starlight 標準への完全移行（当面は GitHub 素読み互換のため温存）。
- splash home の hero リンク（YAML frontmatter）への `check-links` 適用拡張。
- Pages の公開可視性（private repo の制約）は #1302 と調整。
