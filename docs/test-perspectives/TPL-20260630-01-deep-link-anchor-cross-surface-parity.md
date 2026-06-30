---
id: TPL-20260630-01
title: "deep-link アンカーは id ベースの単一文法を全サーフェスで共有する"
status: active
date: 2026-06-30
applicable_to:
  - "URL fragment / アンカーで構造要素や view を指し、複数のサーフェス（静的 SVG の CSS :target / SPA の history hash / サーバ unfurl 経路）が同じアンカーを解決する機能"
  - "同じ「要素アドレス」文法を 2 箇所以上の producer が独立に組み立てるコード（例: 静的 SVG の `<g id>` と SPA の `buildHash`）"
  - "外部 URL から渡るアドレス値を解決して画面遷移 / ドリル / フォーカスする経路"
known_consumers:
  - renderer
  - app-shell
discovered_from:
  - issue: "#1827"
related_to:
  - TPL-20260510-11
  - TPL-20260510-20
  - TPL-20260510-17
  - TPL-20260519-02
topic: navigation
scope:
  packages:
    - core
    - app
---

# TPL-20260630-01: deep-link アンカーは id ベースの単一文法を全サーフェスで共有する

## 観点

構造要素 / view を指す deep-link アンカーは、それを生成・解決するすべての
サーフェスで**1つの文法**を共有しなければならない。文法（prefix・正規化・
identity キー）を各サーフェスが独立に組み立てると、一方で解決するアンカーが
他方で解決しない「片肺 permalink」になり、しかもどちらのサーフェスも単体では
正しく見えるため検出が遅れる。

具体的には:

- アンカーの identity キーは要素の `id`（[TPL-20260510-20](TPL-20260510-20-id-not-label-for-identity.md)）であり、`label` や翻訳 / 表示文字列ではない。
- 文字列正規化（`sanitizeId`）と prefix 組み立ては**単一の関数**（`anchorId`）に集約し、producer が直書きの template literal で再現しない（[TPL-20260510-11](TPL-20260510-11-parallel-function-parity.md) の parallel parity）。
- 外部 URL から来る target 値は解決前に validate / canonicalize し、未知 view / rename 済み id は throw せず安全側（モデル全体 / view root）に degrade する（[TPL-20260510-17](TPL-20260510-17-trust-boundary-input-validation.md)）。

## 想定される失敗モード

- 静的 SVG が `krs-system-Payment` を吐くのに SPA の `buildHash` が別正規化
  （例: 別の sanitize 規則 / prefix）を使い、SVG からコピーした fragment が
  app で root にフォールバックする。逆もある。
- producer の一方だけが新しい view（`matrix` など）に対応し、もう一方が
  古い分岐のままで、その view への deep-link が片方で無言に壊れる。
- target 値を `label` で組み立て、rename / i18n でアンカーが静かに陳腐化する。
- 未検証の target を解決経路に流し、不正値で例外 / 誤遷移が起きる。

## チェックリスト

新しい deep-link / アンカー / fragment-addressing 機能を足すとき:

- [ ] element アンカー文字列は `anchorId` / `sanitizeId`（`@karasu-tools/core`）を経由し、各 producer が `krs-<view>-<id>` を直書きしていない（単一階層の whole-view タブ `#krs-deploy` / `#krs-matrix` / `#krs-org-tree` は element アンカーではない documented 例外 — `docs/spec/permalink.md`）
- [ ] identity キーは `id` であり `label` ではない（highlight / node / view すべて）
- [ ] 静的 SVG（`drill-down-svg.ts`）と SPA（`buildHash`）が同一入力で同一アンカーを返す parity test がある
- [ ] 外部 URL から来る target を validate し、未知 view / 解決不能 id は throw せず degrade する
- [ ] 新しい `view`（`ActiveView` / `ShareTargetView`）を足したら両 producer・両パーサが網羅する（[TPL-20260510-03](TPL-20260510-03-enum-member-addition.md)）

## 既知の対処パターン

`anchorId(viewPrefix, id)` を core に置き、静的 SVG の `<g id>` / back / tab と
SPA の `buildHash` の両方をそこに通す。app 側の `decodeShare` で `target` を
`sanitizeTarget`（既知 view set 照合 + string/boolean 検証）してから解決経路に
渡す。`App.tsx` は share 復元時に `buildHash` で正典 `#krs-…` へ正規化してから
history hook をマウントさせ、既存のドリル / フォーカス解決を再利用する。

## 関連テスト

- `packages/app/src/hooks/useHistoryNavigation.test.ts` — `buildHash` ↔ `anchorId` parity
- `packages/core/src/renderer/drill-down-svg.test.ts` — 静的 SVG の `<g id>` が `anchorId` 文法に一致
- `packages/app/src/utils/inline-share.test.ts` — `decodeShare` の `target` round-trip と不正 view の degrade
- `packages/app/src/App.test.tsx` — `#s=`(target 付き) 復元時の `#krs-…` 正規化

## 派生元 spec

- `docs/spec/permalink.md` / `docs/spec/permalink.ja.md` — 「Deep permalink アンカー」。本 TPL はこの spec のアンカー文法 contract（id ベース・単一 `anchorId`・全サーフェス共有）が破られたときに検出する proactive TPL。
