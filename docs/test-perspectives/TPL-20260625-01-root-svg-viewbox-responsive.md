---
id: TPL-20260625-01
title: "プレビューに渡す root SVG は viewBox を持ち、CSS 縮小時に内容がスケールすること"
status: active
date: 2026-06-25
applicable_to:
  - "ピクセル幅/高さを持つ root <svg> 要素を生成するレンダラー/ビルダー（複数 view の合成・タブ束ね・全レイヤー縦積みなど）"
  - "max-width/max-height で縮小される領域に inline SVG を描画する surface"
known_consumers:
  - svg-builder
  - all-views-svg
  - all-layers-svg
discovered_from:
  - issue: "#1790"
  - root_cause_file: "packages/core/src/renderer/drill-down-svg.ts:437"
related_to:
  - TPL-20260510-11
  - TPL-20260510-12
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-20260625-01: プレビューに渡す root SVG は viewBox を持ち、CSS 縮小時に内容がスケールすること

## 観点

ユーザーに表示する root `<svg>` は、固定ピクセルの `width`/`height` だけでなく
**それに一致する `viewBox` を必ず持つ**。`viewBox` の無い SVG は
`preserveAspectRatio` による内容→ビューポートの写像を持たないため、CSS で
`max-width: 100%` / `max-height: 100%` によってビューポートが縮小されても内容は
1:1 のユーザー単位のまま残り、**左上にクロップされる**（縮小スケールされない）。

これは「単一 view では正しく表示されるのに、複数 view 合成・全レイヤー縦積みなど
別の合成ビルダーだけ崩れる」という形で出る。単一 view の renderer が
`viewBox` を付けていても、それと並行する合成ビルダー群が同じ不変条件を
共有していなければ取りこぼす（[[TPL-20260510-11]] 並行関数パリティの一例）。

## 想定される失敗モード

- 共有 URL（`#s=`）やプレビューで、ペインより大きい図（例: kubernetes example,
  ≈1699×1342）が左上に寄り、右・下が見切れる。
- 単一 view では再現せず、system+deploy+org のような複数 view を持つ図だけ再現
  するため「特定ファイルだけ壊れる」と誤認しやすい。
- エクスポートした SVG を外部ビューア（width 制約あり）で開くと同様にクロップ。

## チェックリスト

root `<svg>` 文字列を組み立てる箇所を追加/変更したら:

- [ ] root `<svg>` に `viewBox="0 0 ${width} ${height}"` を付け、`width`/`height` と一致させたか
- [ ] 単一 view だけでなく、複数 view 合成・束ね・全レイヤーなど**すべての合成ビルダー**で同じ不変条件を満たしたか
- [ ] `max-width/max-height: 100%` の領域に置いたとき、ペインより大きい図が左上クロップではなくスケールして全体表示されるか
- [ ] root の `viewBox` 追加後も、ネストした `<svg width="100%">` の解決値（= ビューポート寸法）が変わらないことを確認したか（座標数値が同じなら内部レイアウトは不変）

## 既知の対処パターン

合成ビルダーの root `<svg>` に `viewBox="0 0 ${totalWidth} ${totalHeight}"` を
`width`/`height` と並べて出力する（#1790）。座標系の数値は変えないので、内側の
ペイン（`width="100%" height="100%"`）の解決は同一で、CSS 縮小時の responsive
スケールだけが回復する。単一 view 側（`svg-renderer.ts` の `viewBox`）が既に
正解なので、それを「全 root SVG が満たすべき不変条件」として横展開する。

## 関連テスト

- `packages/core/src/renderer/drill-down-svg.test.ts` — "root svg has a viewBox matching width/height (#1790)"（`buildAllViewsSvg` / `bundleSingleLevelViews`）
- `packages/core/src/renderer/all-layers-svg.test.ts` — "root svg has a viewBox matching width/height (#1790)"
