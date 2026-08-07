---
id: TPL-2366
title: "canvas 上に直接描かれる文字色（badge-color 等）はテーマごとに 4.5:1 を機械検証する"
status: active
date: 2026-08-07
applicable_to:
  - "builtin テーマ（dark / light）に badge-color / テキスト系色を追加・変更するとき"
  - "canvas / カード背景の上に直接文字を描く新しい描画要素を追加するとき"
discovered_from:
  - issue: "#2366"
  - root_cause_file: "packages/core/src/builtins/default-style.ts"
related_to:
  - TPL-1697
topic: styling
scope:
  packages:
    - core
---

# TPL-2366: canvas 上に直接描かれる文字色（badge-color 等）はテーマごとに 4.5:1 を機械検証する

## 観点

バッジラベルのように**背景（canvas / カード）の上へ直接小さな文字として描かれる色**は、
テーマごとに WCAG AA（通常テキスト 4.5:1 以上）を満たすことを、目視ではなく
ユニットテストで検証する。色は「dark で選んだ値をそのまま light に流用」した瞬間に
壊れる（dark canvas で 7.8:1 の緑 `#22C55E` は白 canvas で 2.28:1）。

TPL-1697（kind の background-color には対の text color を設定する）が「色の組を
揃える」観点なのに対し、本観点は**組が揃っていても比が足りない**ケースを検出する。

## 想定される失敗モード

- 新しい deploy kind / annotation を追加するとき、dark 用の badge-color だけ決めて
  light テンプレートに同じ値をコピーする → light で 2〜3:1 になり読めない。
  （実例: #2366 で light の deploy kind バッジ 9 色全てが未達、`function` は 1.92:1）
- palette / builtin の色を「少し明るく」調整するリファクタで、しきい値を割ったこと
  に誰も気づかない（見た目の変化が小さいため diff レビューをすり抜ける）。

## チェックリスト

builtin テーマや palette の文字系色を追加・変更するとき:

- [ ] その色は canvas またはカード背景の上に**文字として**描かれるか確認したか
- [ ] dark / light 両テーマで `contrastRatio()` が 4.5 以上か
      （`default-style-contrast.test.ts` が badge-color を自動検証する。対象外の
      色を足した場合はテストの走査対象に追加する）
- [ ] 4.5 未満なら同系色相の暗色/明色へ倒したか（彩度維持のまま明度だけ調整）

## 既知の対処パターン

- light テーマの badge-color を同色相の暗色へ倒す（#2366: `#22C55E` → `#15803D`、
  `#EAB308` → `#A16207` 等。annotation は ADR-1479 の `LIGHT_BADGE_COLORS` を拡張）。
- 比較は `packages/core/src/renderer/contrast.ts` の `contrastRatio()` を使う
  （手計算・目視をやめ、テストと同じ実装で判定する）。

## 関連テスト

- `packages/core/src/builtins/default-style-contrast.test.ts` — 両テーマの builtin
  sheet を走査し、全 badge-color が canvasBg に対して 4.5:1 以上であることを検証。
