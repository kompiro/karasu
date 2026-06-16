---
id: ADR-20260616-02
title: "docs/guide の hero スニペットを正典として、レンダリング済み SVG を生成・併置し drift gate で縛る"
status: accepted
date: 2026-06-16
topic: build
related_to:
  - ADR-20260512-03
scope:
  concerns:
    - ci
    - i18n
assumptions:
  - "grep: package.json :: \"gen:guide-diagrams\""
  - "grep: scripts/guide/gen-guide-diagrams.ts :: gen:guide-diagram:"
---

# ADR-20260616-02: docs/guide の hero スニペットを正典として、レンダリング済み SVG を生成・併置し drift gate で縛る

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **Issue**: [#1574](https://github.com/kompiro/karasu/issues/1574)
- **関連**:
  - 実装 PR [#1618](https://github.com/kompiro/karasu/pull/1618)、設計 PR [#1615](https://github.com/kompiro/karasu/pull/1615)
  - [ADR-20260512-03](./20260512-03-reference-data-single-source.md) — 正典から再掲を生成し drift gate で縛る同系統の判断（`gen:reference`）
  - 関連 TPL: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) / [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) / [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) / [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md)
  - コード: `scripts/guide/gen-guide-diagrams.ts`、`docs/guide/diagrams/`

## 背景

`docs/guide/`（5 章 × en/ja）の説明用 `.krs` スニペットはコードのみで、実際の出力図が無かった。読者は karasu の auto-layout が実際に何を描くかを見られない。show-don't-tell のため、各「hero」スニペットの直下にレンダリング済みの図を併置したい。

制約として、GitHub は markdown 内の inline `<svg>` を sanitize するため、SVG は**ファイルとして commit** し `![](diagrams/x.svg)` で参照する必要がある（`docs/github-actions.md` と同じ render-and-commit パターン）。また en/ja でラベルが異なるため言語別の図が要る。スニペットを markdown とサイドカー `.krs` の二重管理にすると drift する。

## 決定

markdown の fenced ```krs ブロックを**単一の正典**に保ち、直上の HTML コメントマーカー `<!-- render: <view> id=<id> [style] -->` が付いた hero スニペットだけを、core の `compile()` で `light` テーマ・単一 view レンダリングし、`docs/guide/diagrams/<id>.svg`（en）/ `<id>.ja.svg`（ja）に生成して、コードブロック直下の `<!-- gen:guide-diagram:<id> -->` 管理区間に画像参照を挿入する。生成は `pnpm gen:guide-diagrams` で行い、`--check`（in-memory 再生成して disk と比較、stale なら exit 1）を既存 `reference-docs-check.yml` と lefthook の drift gate に載せる。初期対象は 5 章にわたる 11 図（system / org / styled）× en/ja。

## 理由

- **単一正典**: スニペットの正典が fenced ブロック 1 箇所に留まり、サイドカー複製の drift が原理的に発生しない（[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)）。
- **既存パターンの踏襲**: `gen:reference` と同じ「正典 → 再掲を生成 → `--check` で片方向 drift gate」の構造に揃えた（[ADR-20260512-03](./20260512-03-reference-data-single-source.md) / [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)）。レビュアー・CI・lefthook の慣れが効く。
- **core 直呼び**: CLI は file 引数必須・stdin 非対応のため、抽出した krs 文字列を直接渡せる `compile()` を使う。subprocess なしで速く、temp ファイル不要。
- **決定性**: `compile()` は決定的なので再生成が diff-stable で、drift gate が安定する（[TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md)）。
- **言語パリティ**: en/ja を対で生成し、両言語の図が揃うことを担保（[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)）。
- **テーマ**: ガイドは GitHub の白背景 markdown で読まれるため `light` テーマを採用。
- **styling 章**: `style` フラグで直後の css ブロックを styleSource として適用し、スニペットの `@import "*.krs.style"`（隣に実ファイルが無い）行を除去することで、テーマ色とバッジ付きの図を出せる。

## 却下した案

- **サイドカー `.krs` ファイルを置き、ガイドからは画像のみ参照**: スニペットが markdown とサイドカーで二重化し drift する。[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) に反するため却下。
- **抽出した krs を temp ファイルに書き CLI `render` を呼ぶ**: core API があるのに subprocess・temp ファイルのオーバーヘッドを払う理由がない。却下。
- **専用の新規 CI workflow を立てる**: 既存の generated-doc drift job（`reference-docs-check.yml`）と性質が同じで、Required status `Reference docs` + skip companion の仕組みにそのまま相乗りできる。job を増やす必然がないため、既存 job にステップ追加とした。

## スコープ外

- 全スニペットの描画（hero のみ。`.krs.style` / `legend` 断片・CLI 出力・partial example は対象外）。
- side-by-side（HTML table）レイアウト。今回はコードの下に縦並び。将来の refinement。
- `karasu diff` の SVG 埋め込み（Issue で optional 扱い）。
- pixel-perfect layout 調整（draw.io export が escape hatch、`docs/concepts.md` の non-goal）。
