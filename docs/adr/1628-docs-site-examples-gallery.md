---
id: ADR-1628
title: "docs-site の Examples gallery は examples/ をビルド時レンダリングして出す（SVG はコミットしない）"
status: accepted
date: 2026-06-16
topic: build
depends_on:
  - ADR-1575
related_to:
  - ADR-1574
  - ADR-1642
scope:
  packages:
    - docs-site
  concerns:
    - ci
    - i18n
assumptions:
  - "file: packages/docs-site/scripts/lib/examples-manifest.ts"
  - "file: packages/docs-site/scripts/lib/render-examples.ts"
  - "file: packages/docs-site/scripts/lib/gallery-pages.ts"
  - "symbol: packages/docs-site/scripts/lib/render-examples.ts :: ReadOnlyNodeFs"
  - "symbol: packages/docs-site/scripts/lib/gallery-pages.ts :: indexPageMarkdown"
  - "grep: packages/docs-site/scripts/sync.ts :: generateGallery"
---

# ADR-1628: docs-site の Examples gallery は examples/ をビルド時レンダリングして出す（SVG はコミットしない）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1628](https://github.com/kompiro/karasu/issues/1628)（docs site Phase 2 — 本 ADR はうち「Examples gallery」項目）
  - 実装 PR: [#1640](https://github.com/kompiro/karasu/pull/1640)
  - 親 ADR: [ADR-1575](./1575-docs-site-ssg.md)（docs-site SSG 選定。examples gallery を Phase 2 の「決めなかったこと」として明示的に後続化していた — 本 ADR がそれを埋める）
  - 後続 ADR: [ADR-1642](./1642-en-ja-example-parity.md)（`examples/<lang>/<name>/` への再配置と gallery の en/ja 完全対応。本 ADR の manifest を per-locale entry に一般化した）
  - 関連 ADR: [ADR-1574](./1574-guide-embedded-diagrams.md)（guide の hero スニペット → committed SVG。本 ADR が**採らなかった**方式）
  - 関連 TPL: [TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md)（docs 取り込みパイプラインの link/anchor 解決）、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)（正典 ↔ 再掲の片方向同期）
  - AT: [`docs/acceptance/1628-examples-gallery.md`](../acceptance/1628-examples-gallery.md)
  - コード: `packages/docs-site/scripts/lib/{examples-manifest,render-examples,gallery-pages}.ts`、`packages/docs-site/scripts/sync.ts`、`examples/`
  - 設計過程: `docs/design/docs-site-examples-gallery.md`（本 ADR に昇格して削除、[#2233](https://github.com/kompiro/karasu/issues/2233)）

## 背景

Phase 1（ADR-1575）で `docs/`（guides / spec / concepts）から docs サイトを生成したが、`examples/` のサンプル `.krs` プロジェクトはサイトに載っていなかった。ユーザーが「コードと、そこから生成される図」を並べて見られる Examples gallery を追加し、karasu の実出力（auto-layout の図）を手早く確認できるようにしたい。

論点は「gallery の SVG をどこから供給するか」だった。karasu には既に先行例が 2 つあり、方式が割れていた:

- **guide diagrams**（ADR-1574 / `scripts/guide/gen-guide-diagrams.ts`）— SVG を**コミット**し、drift check で `.krs` との乖離を検出する。
- **docs-site sync**（ADR-1575 / `packages/docs-site/scripts/sync.ts`）— 生成物は gitignore し、ビルドのたびに `docs/` から作り直す。

`examples/` を single source of truth に保つ点は前提として動かないので、選ぶのは gallery が前者・後者どちらの系譜に属するかである。

## 決定

**Examples gallery は docs-site の sync 時に `examples/` をレンダリングして生成し、SVG はコミットしない。** 対象と見せ方は manifest（`examples-manifest.ts`）で明示列挙し、レンダリングは core の `compileProject` に read-only な Node FileSystemProvider を渡して行う。

## 理由

- **drift 構造が生まれない**。SVG が毎ビルドの派生物なので「`.krs` を直したのに古い SVG が残る」事故が原理的に起きない。committed 方式は drift guard 面をもう一つ増やすが、gallery はサイト専用面なのでそのコストを払う動機がない。
- **guide diagrams が committed なのは GitHub 素読みの markdown に図を埋めるため**であり、サイトでしか見えない gallery にはその要件が当てはまらない。方式の違いは一貫性の破れではなく、埋め込み先の違いから出ている。
- **`examples/` が SVG で汚れない**。example の編集体験（`.krs` を書くだけ）が不変に保たれる。
- **core の Pure TS 方針を壊さない**。`FileSystemProvider` は interface として core にあり、Node 実装は環境別パッケージに置く約束なので、read-only 実装（`ReadOnlyNodeFs`）は docs-site 内に持つ（`packages/cli/src/matrix.ts` の `NodeFileSystemProvider` を写した ~30 行）。
- **対象を manifest で明示列挙する**のは、エントリ名が不揃い（`index.krs` / `system.krs` / `01-system.krs` …）で、`github-actions/` のように `.krs` を持たないディレクトリもあるため。ディレクトリ走査による暗黙の収集は、example を足したときに壊れ方が分かりにくい。
- **PR CI 安全性**は vitest の smoke test で担保する。docs-site build は `pages.yml` でしか走らないので、「全 example がレンダリングでき、想定ビューが非空である」ことを PR CI に乗る unit test 側で assert する（`render-examples.test.ts` / `gallery-pages.test.ts`）。

## 却下した案

- **committed SVG + drift check（guide diagrams と同方式）** — GitHub 上でも SVG をプレビューでき、先行実装と方式が揃う。しかし example 数 × 複数ビューぶんのコミット物が増え、drift guard 面が一つ増える。gallery はサイト専用面であり、GitHub プレビューの価値は `examples/` への GitHub リンクで十分代替できる。

## 実装が設計から動いた点

昇格時点（本 ADR 記録時）の実装は、設計時の想定から次の 2 点で良い方向に動いている。記録として残す。

- **出すビューは manifest で宣言せず、コンパイル結果から自動選択する**。設計では「どのビューを出すかは example ごとに manifest で明示」としていたが、実装は `compileProject` の結果から中身のある view（system / deploy / org）だけを選ぶ。`deploy-only` / `org-only` のような example が manifest を書き換えずに正しく出るので、宣言が実態から drift しない。
- **entry は per-locale を許す**。ADR-1642 で `examples/<lang>/<name>/` に再配置したのに合わせ、manifest の entry は単一文字列と `{ en, ja }` の両方を取る（`resolveEntry`）。図は言語非依存という当初の前提は、ラベルが各言語で書かれる以上は成り立たなかった。
