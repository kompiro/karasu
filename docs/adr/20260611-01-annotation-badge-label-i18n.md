---
id: ADR-20260611-01
title: 組み込みアノテーションバッジラベルは reference-data から生成し locale 注入可能にする
status: accepted
date: 2026-06-11
topic: styling
related_to: [ADR-20260425-01, ADR-20260522-01]
scope:
  packages: [core, app]
  concerns: [i18n]
assumptions:
  - "symbol: packages/core/src/builtins/default-style.ts :: AnnotationBadgeLabels"
  - "symbol: packages/core/src/builtins/default-style.ts :: buildBuiltinStyleSource"
  - "grep: packages/core/src/builtins/default-style.ts :: __ANNOTATION_RULES__"
  - "file: packages/core/src/badge-labels-meta.test.ts"
  - "symbol: packages/app/src/i18n/use-annotation-badge-labels.ts :: useAnnotationBadgeLabels"
  - "grep: packages/i18n/src/en.ts :: badge.deprecated"
---

# ADR-20260611-01: 組み込みアノテーションバッジラベルは reference-data から生成し locale 注入可能にする

- **日付**: 2026-06-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1508](https://github.com/kompiro/karasu/issues/1508)（前段 [#1496](https://github.com/kompiro/karasu/issues/1496)、実装 PR [#1511](https://github.com/kompiro/karasu/pull/1511)、Design Doc PR [#1510](https://github.com/kompiro/karasu/pull/1510)）
  - [ADR-20260425-01](20260425-01-i18n-default-policy.md) — i18n 既定ポリシー（core は翻訳テーブルを import しない）
  - [ADR-20260522-01](20260522-01-svg-diagram-theming.md) — theme threading の前例
  - [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md), [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md), [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
  - AT: [docs/acceptance/1508-annotation-badge-label-i18n.md](../acceptance/1508-annotation-badge-label-i18n.md)

## 背景

組み込みデフォルトスタイルのアノテーションバッジラベル（`@deprecated` /
`@experimental` / `@migration_target`）は `BUILTIN_STYLE_SOURCE` /
`BUILTIN_STYLE_SOURCE_LIGHT` 内の文字列リテラルにハードコードされていた。
2026-06-10 の spec 適合性監査（#1496）で、同じ概念が 3 表記
（廃止予定 / Deprecated / 非推奨）に分かれていることが判明。英語に統一する
だけの短期修正（PR #1507）は「en 固定になるだけで locale に追従しない」ため
マージせずクローズし、バッジラベルは SVG に埋め込まれるユーザー向け文字列
として `docs/spec/i18n.md` のポリシー（locale 依存文字列は呼び出し側から
注入する）に従わせることにした。

## 決定

builtin シートのアノテーション 4 ブロック（`@deprecated` / `@new` /
`@experimental` / `@migration_target`）をリテラルではなく
**`reference-data.ts` の `defaultBadge`（色・アイコン・en ラベルの単一真実源）
+ theme 別色テーブル + 注入ラベル（`AnnotationBadgeLabels`）から生成** し、
`getBuiltinStyleSheet(theme, badgeLabels?)` が (theme × ラベル組) ごとに
parse 済みシートをキャッシュする。注入は `EmptyStateLabels` と同じ
「解決済みプレーン文字列を呼び出し側から渡す」流儀で、`compileProject` 等の
compile 系・SVG builder ファミリ全員にオプションとして通す。app は
`useAnnotationBadgeLabels()`（`badge.*` キー）で現在ロケールから生成して渡す。

## 理由

- **カスケード意味論が無変更** — builtin 最下層・ユーザー `.krs.style` の
  `badge-label` が常に勝つ、という既存の読み筋を保ったまま locale 次元を
  足せる唯一の案だった
- **単一真実源化**（TPL-20260519-02 の本命対処）— ラベルの正典が
  `reference-data.ts` に一本化され、#1496 の 3 表記不一致が構造的に再発
  しなくなる（builtin シート ↔ reference-data の parity テストで固定）
- **既存パターンの合成** — `EmptyStateLabels`（文字列注入、#1494）と
  ADR-20260522-01（theme threading）の確立済みパターンに乗り、新規概念を
  導入しない。全エントリポイント貫通は `badge-labels-meta.test.ts`
  （`theme-meta.test.ts` と同型の curated table）で検証する
- デフォルト（無注入）は reference-data の **en** ラベル。ja は
  reference-data の ja（非推奨 / NEW / 実験的 / 移行先）に従い、旧 builtin の
  「廃止予定」表記は廃する

## 却下した案

- **解決後のスタイルへのラベル置換** — 「この badgeLabel は builtin 由来か
  ユーザー上書きか」という provenance 追跡が resolved style に必要になり、
  カスケード実装への侵襲が大きい。誤置換のエッジケースも潰しにくい
- **builtin シートから badge-label を撤去し renderer 側でフォールバック** —
  「badge-label 未指定」と「builtin デフォルト」の区別が消えて後方非互換。
  renderer の複数アノテーション優先順位ロジックに注入マップ参照が絡んで
  複雑化する

## スコープ外（レビューで確定）

- `AnnotationBadgeLabels` は `EmptyStateLabels` とは別の独立オプション
  （統合バンドル化は注入オプションが 3 つ以上に増えた時点で再検討）
- `@new` も対称性のため注入可能キーに含める（現状 en/ja とも "NEW"）
- CLI / VS Code の locale 対応はスコープ外（デフォルト en。`--locale` と
  翻訳テーブルの置き場所は別 Issue で扱う）
