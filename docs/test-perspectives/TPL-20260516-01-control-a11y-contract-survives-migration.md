---
id: TPL-20260516-01
title: "interactive control の a11y 契約は機能テストに映らないので移行・リファクタで静かに壊れる"
status: active
date: 2026-05-16
applicable_to:
  - "既存の interactive control（button / tab / list item / menu item / toggle）を別の primitive やコンポーネントに移行・リファクタする変更"
  - "ARIA role / aria-* 属性 / 可視ラベルといった markup レベルの契約を持つ UI 要素"
known_consumers:
  - shadcn-ui-primitives
  - snapshot-picker-modal
  - preview-toolbar
  - diff-mode-banner
discovered_from:
  - issue: "#1399"
  - root_cause_adr: "ADR-20260515-01"
related_to:
  - TPL-20260510-09
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260516-01: interactive control の a11y 契約は機能テストに映らないので移行・リファクタで静かに壊れる

## 観点

interactive control（button / tab / list item / menu item / toggle）は、クリックハンドラやレンダリング結果といった「機能」の他に、**markup レベルの a11y 契約**を持つ:

- **ARIA role の入れ子の妥当性** — `role="listitem"` は `role="list"` の子であること、`role="menuitem"` は menu コンテナの子であること等。`<button role="listitem">` のように role を非互換な要素に付けると無効になる
- **ボタンの可視テキストラベル** — アイコンのみのボタンは禁止（ADR-20260328 / `.claude/rules/app-ui.md`）。`aria-label` だけでは sighted user に伝わらない
- **toggle の状態反映** — トグルは `aria-pressed` を持ち、かつ可視ラベルやスタイルでも押下状態が分かること

これらの契約は **機能テスト（クリックで何が起きるか）には現れない**。コンポーネントを別の primitive に移行したりリファクタしたりすると、機能は維持されても a11y 契約だけが静かに劣化する。移行 PR ではこの契約を明示的に点検する。

## 想定される失敗モード

- コンポーネントを shadcn / Radix 等の primitive に移行した際、元のコードが持っていた `aria-*` 属性や role が引き継がれず欠落する（機能テストは緑のまま）
- 旧実装の `active` CSS クラスを `aria-pressed` に置き換えたが、可視ラベルが状態を反映しないまま残る（例: トグルなのに常に同じ語）
- 既存コードに最初から潜んでいた無効な ARIA（`<button role="listitem">` 等）が、移行時に「そのまま移植」されて温存される
- アイコンのみのボタンが「既存もそうだから」とレビューを素通りする
- 実例（#1399）: shadcn/ui 移行レビューで `SnapshotPickerModal` の `<button role="listitem">`、`export-error-dismiss` のアイコンのみボタン、`DiffModeBanner` Swap ボタンのラベル不変が同時に表面化した

## チェックリスト

- [ ] 移行・リファクタ対象の control が持っていた `aria-*` 属性・`role`・`type` を、移行後の要素がすべて引き継いでいるか差分で確認した
- [ ] `role` を持つ要素は、その role が要素タグおよび親コンテナの role と ARIA 仕様上整合しているか（`listitem`→`list` の子、`menuitem`→menu の子、`button` に `listitem` を付けていない 等）
- [ ] すべてのボタンに可視テキストラベルがあるか（アイコンのみは不可。`aria-label` は補助であって代替ではない）
- [ ] toggle は `aria-pressed` を持ち、かつ可視ラベルまたはスタイルでも押下状態が区別できるか

## 既知の対処パターン

- 移行 PR の diff レビューで、旧 markup と新 markup の `aria-*` / `role` / `type` を 1 対 1 で突き合わせる
- ARIA role を持つリスト/メニューは、interactive 要素（`<button>`）を role 専用のラッパ要素で包む（`<div role="listitem"><button>…</button></div>`）。role を interactive 要素に直付けしない
- toggle は「状態を変える語のペア」をラベルにする（`↗ Focus` / `↙ Exit Focus` のように）。状態の無い動詞だけ（`Swap`）は避け、`Swap` / `Swap back` のように press 後の意味が読めるラベルにする
- a11y 属性を contract test で固定する（`getByRole` でのクエリ、`toHaveAttribute("aria-pressed", …)` 等）。class ベースの assert は移行で容易に壊れるので role / 属性ベースにする（`.claude/rules/testing.md` 参照）

## 関連テスト

- `packages/app/src/components/PreviewColumn.test.tsx` — toggle 状態を `aria-pressed` で assert（shadcn Button 移行で class → 属性に変更）
- `packages/e2e/tests/at-0033-drilldown-export.spec.ts` / `at-0044-org-tree-view.spec.ts` / `at-0048-resource-shape-icon-mode.spec.ts` — トグルの `aria-pressed` を E2E で固定
