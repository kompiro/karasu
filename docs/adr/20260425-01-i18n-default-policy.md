---
id: ADR-20260425-01
title: ユーザー向け文字列はデフォルトで i18n を通す
status: accepted
date: 2026-04-25
topic: app-ui
depends_on:
  - ADR-20260420-03
related_to:
  - ADR-20260418-01
scope:
  packages:
    - app
    - core
    - cli
    - lsp
    - vscode
  concerns:
    - i18n
assumptions:
  - "file: docs/spec/i18n.md"
  - "file: packages/core/src/renderer/empty-state-labels.ts"
  - "symbol: packages/core/src/renderer/empty-state-labels.ts :: DEFAULT_EMPTY_STATE_LABELS"
  - "symbol: packages/app/src/i18n/use-empty-state-labels.ts :: useEmptyStateLabels"
---

# ADR-20260425-01: ユーザー向け文字列はデフォルトで i18n を通す

- **日付**: 2026-04-25
- **ステータス**: 決定済み
- **関連**:
  - Issue [#813](https://github.com/kompiro/karasu/issues/813)
  - 仕様: [`docs/spec/i18n.md`](../spec/i18n.md)
  - ADR-20260420-03 — i18n Rollout（インフラ整備）
  - ADR-20260418-01 — Chat system prompt i18n
  - 関連 PR: [#822](https://github.com/kompiro/karasu/pull/822)（design doc）/ [#826](https://github.com/kompiro/karasu/pull/826)（spec 化）

## 背景

ADR-20260420-03 で i18n インフラ（`useTranslation` / `EmptyStateLabels`
pass-through など）は揃ったが、「i18n を使う／使わない」の判断が暗黙だった
ため、PR レビューのたびにハードコード英文が見つかり反応的な i18n 化が積み重なっていた
（`"No nodes to render"`, `"No org diagram"` ほか）。
判断のばらつきと再発防止のため、方針の成文化が必要になった。

## 決定

ユーザーに見える文字列はデフォルトで i18n を通す — app は `useTranslation` で、
core は呼び出し側からの pass-through オプションで受け取る。`DEFAULT_EMPTY_STATE_LABELS`
など core 側の英語文字列は app を経由しないユースケース向けの最終フォールバックと位置付ける。
詳細な規約は `docs/spec/i18n.md` に置く。

## 理由

- **再発を仕組みで抑える**: 規約が文書化されていればレビューチェックリストにも乗せられ、
  新規コードがハードコード英文を持ち込みにくい。
- **境界を変えない**: `packages/core` は単体配布されうるため、app の翻訳テーブルを
  import させない。pass-through オプションで分離を保つ。
- **CLI / ライブラリ利用の DX を壊さない**: 英語フォールバックを残すことで
  app を経由しない consumer（CLI、core 単体テスト、サードパーティ）でも
  破綻しない。
- **段階的に潰す**: 既存ハードコードは follow-up Issue（#827, #828）で
  opportunistic に i18n 化する。policy PR の肥大化を避ける。
- **重い投資を避ける**: oxlint カスタムルールではなく、ja ロケールでの
  compile を spot check するシンプルな regression test を将来の follow-up
  に乗せる方針とした。

## 却下した案

- **policy doc を `docs/process.md` に統合**: process の他項目と粒度が合わず、
  key naming 規約まで書くと浮く。`docs/spec/i18n.md` を新設して 1 行参照する形に
  した。
- **core の英語フォールバックを撤廃して labels を必須化**: app を経由しない
  consumer の DX を悪化させ、テストでも毎回ボイラープレートが要るため不採用。
- **oxlint カスタムルールで JSX/SVG の string literal を禁じる**: 開発・誤検出
  対策のコストが本 Issue のスコープに対して大きすぎる。将来 i18n 規模が
  大きくなったら再検討する。
- **realizes 等のコード識別子も i18n 化**: 識別子は表示時に i18n 化された
  message に変換される運用が確立しているため対象外とする。
