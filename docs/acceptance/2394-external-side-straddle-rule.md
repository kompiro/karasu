# AT: ハブが片側に寄っているとき external を遠い列へ飛ばさない

- **日付**: 2026-08-15
- **関連 Issue**: [#2394](https://github.com/kompiro/karasu/issues/2394)
- **設計 (ADR)**: [ADR-2394](../adr/2394-external-side-straddle-rule.md)
- **Related TPLs**:
  [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)（観点 8 を本 Issue で改訂）
- **対象ファイル**:
  - `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides` の閾値選択）

## 概要

system view の `[external]` は、それを呼ぶハブの x 重心でサイド列に振り分けられる（ADR-1728）。
閾値には自動割り当て分の重心の **median** を使っていたが、median は順位ベースの統計量なので
**必ず集合の内側に落ちる** — つまりハブが実際にどこにいても分割が起きる。結果、ハブが全員
右半分にいるモデルでも最も左寄りの external が左列へ飛ばされ、その 1 本のエッジが図を横断
していた（計測: external 系エッジ長 640px、ハブの隣に置けば 421px）。

修正は場合分けを 1 つ足すこと。重心が content centre を**跨いでいれば従来どおり median 分割**
（cross-hub 交差を分離する ADR-1728 の意図）、**跨いでいなければ自動割り当て分をまとめて
ハブのある側へ置く**。後者を「centre を閾値にした比較」で書くと同じ穴が 1 段下に開く —
ハブがちょうど centre に載った external だけが `<=` で左に落ち、兄弟から切り離される。
分けるものが無い場合はグループ単位で決める。#2384 が塞いだ「spread ゼロ」は、
epsilon 付きの跨ぎ判定の極限として含まれる。

## 受け入れ条件

### AC-1: ハブが片側に寄っているとき

- [x] 消費ハブが全員 content centre より右なら、両方の external が右列に置かれる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps both externals right when every consuming hub is right of centre (#2394)`

- [x] 消費ハブが全員 content centre より左なら、両方の external が左列に置かれる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps both externals left when every consuming hub is left of centre (#2394)`

- [x] 最寄りのハブが content centre とちょうど一致していても、そのグループは分割されない
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps a hub sitting exactly on the centre with its one-sided group (#2394)`

### AC-2: ADR-1728 の分離が残っていること

- [x] 消費ハブが左右に跨っているモデルでは、従来どおり左右に分かれる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `still splits the sides when the consuming hubs straddle the centre (#2394)`

- [x] 単独 external / 同一ハブ集合を共有する external（#2384 の退化ケース）が引き続きハブ側に置かれる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `puts a lone external on the side its consumers are on (#2384)` / `keeps a lone external left when its consumers are on the left (#2384)` / `puts externals that share one right-side hub set on the right (#2384)`

- [x] `column: left/right` の明示ヒントが自動振り分けより優先される（TPL-1761 観点 3）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `honors column:left/right to override the auto side assignment (#1728)`

## 手動確認

N/A — 自動テストですべて覆っている。配置は座標から決まり、判定は座標の比較で足りる。

## 補足

- 実モデルへの影響は計測済み（`reports/external-side-rule/` のハーネス）。`examples/en/hato`
  は交差 4 / external エッジ長 4339 で**変化なし**、他の examples も同値。変わるのは
  「ハブが片側に寄っている」モデルだけで、repro では 640 → 421px。
- 常に content centre で比較する案（median を捨てる）も測った。跨ぐモデルの挙動を交差と長さの
  トレードで書き換えるため採らなかった。数字は [ADR-2394](../adr/2394-external-side-straddle-rule.md) にある。
