---
id: ADR-20260615-02
title: "ライフサイクルアノテーションに移行 intent パラメータを持たせる"
status: accepted
date: 2026-06-15
topic: core-concepts
related_to:
  - ADR-20260511-02
scope:
  packages: [core, i18n]
assumptions:
  - "grep: packages/core/src/parser/parser.ts :: ANNOTATION_PARAM_KEYS"
  - "symbol: packages/core/src/types/ast.ts :: BaseNodeFields"
  - "grep: packages/i18n/src/en.ts :: annotationParamUnsupported"
---

# ADR-20260615-02: ライフサイクルアノテーションに移行 intent パラメータを持たせる

- **日付**: 2026-06-15
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1568](https://github.com/kompiro/karasu/issues/1568)（gap B / 親 [#1567](https://github.com/kompiro/karasu/issues/1567)）
  - 非目標の境界: [#23](https://github.com/kompiro/karasu/issues/23)（sequence / 時間軸モデリングはスコープ外）
  - 先例: [ADR-20260511-02](20260511-02-no-runtime-authz-modeling.md)（実装側関心を語彙に入れず散文/link に逃がす）、`operations` の verb-decoration、open annotation、`job.schedule`
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
  - コード: `packages/core/src/parser/parser.ts`, `packages/core/src/types/ast.ts`

## 背景

ライフサイクルアノテーション（`@deprecated` / `@new` / `@experimental` / `@migration_target`）は裸のフラグで、移行の目標時期・移行元はすべて散文 `description` 行きだった。machine-readable にできれば「Q3 前廃止を色分け / クエリ」「日付付きグラフの export」が開けるが、karasu は時間軸・スケジューリングを非目標とする（#23）。検討の経緯は Design Doc（本 ADR に集約、同 PR で削除）と Issue #1568 を参照。

## 決定

組み込みライフサイクルアノテーションに **パラメータ構文 `@name(key: "value")`** を追加する。

- 認識キーは組み込み限定: `until`（`@deprecated` / `@experimental`）、`from`（`@migration_target`）。
- **値は精度による graceful degradation**: `until` が日付 / 年月 / 四半期としてパース可なら machine-usable、不可なら opaque な表示専用文字列（エラーにしない）。
- **未対応パラメータ**（他アノテーションへの param・未認識キー）は `annotation-param-unsupported` 警告とともに破棄する（黙殺しない）。独自アノテーションは当面パラメータ非対応。
- **実行時評価はしない**: `until` は intent の記録で、現在日付と比較しない（drift で警告を出さない）。
- AST はアノテーション名リスト（`annotations: string[]`）を変えず、`annotationParams?` を並行保持する（style セレクタ・継承・描画の既存消費者に無影響）。

**本 ADR のスコープは言語層**（構文・保持・検証・spec）。`until` 値の日付解釈ヘルパと、params を使う表示 / filter / export の **消費者は本スコープ外**（[#1595](https://github.com/kompiro/karasu/issues/1595) で後続）。PERT / クリティカルパスは非目標で、必要なら export に逃がす。

## 理由

- **karasu idiomatic**: 「認識→意味付与／認識外→opaque 保持」は `operations` 装飾・open annotation・`job.schedule` と同系。曖昧な時期（"来年あたり"）も壊さず書ける。
- **fact / 縁は散文の系譜**: 厳密日付は machine-usable、曖昧表現は表示のみ。authz の `アクセス:` 散文規約（ADR-20260511-02）と同じ「縁は緩く」。
- **TPL-20260610-01**: 受理する語彙は効果を持つか警告される。未対応 param を warn する根拠。
- **非目標の堅持**: 時間軸スケジューリング（PERT）は core に入れず export に委ねる。`until` を runtime 評価しないことで scheduler 化を防ぐ。

## 却下した案

- **strict 型付きのみ**（文字列フォールバック無し）: 曖昧な時期を書けず散文に逃げる。open/散文寄りの文化と不整合。
- **散文のまま（現状維持）**: machine-readable にならず、将来の filter / export 余地が閉じる。
- **PERT / クリティカルパスを core 内製**: 非目標（#23）。export 経由に留める。

## 影響範囲

- 後方互換: 既存の裸フラグはそのまま有効。params は opt-in。
- `docs/spec/tags-annotations.md`（en/ja）に「Annotation parameters」節を追加（TPL-20260610-01 と双方向リンク）。
- 公開 CLI（`karasu`）のパースに新構文が surface（changeset minor）。
