---
type: product
---

# AT: shape mode の `shape: url()` アイコンがカード枠を持ち、比率を保って描かれる（#2696）

- **日付**: 2026-09-11
- **関連 Issue**: [#2696](https://github.com/kompiro/karasu/issues/2696)
- **Related TPLs**:
  [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードは全描画面で点検する）、
  [TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)（幾何は描画出力から読む）、
  [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)（告知は移行先と同じ release に置く）
- **対象ファイル**:
  - `packages/core/src/renderer/svg-renderer.ts`（`iconBodyBox` / `renderIconFrame` / `renderSlottedText`）
  - `packages/core/src/shapes/shape-registry.ts`（emit する scale の丸め）
  - `README.md` / `docs/tools/app.md` / `docs/tools/app.ja.md`（icon mode の非推奨告知）

> shape mode では外部 SVG アイコン（`shape: url()`）にカード枠が描かれず、アイコン本体は
> テキストから測った箱に軸ごと独立してスケールされていた（`160×100` の viewBox が `286×84`
> のカードに入り `scale(1.79, 0.84)` = 比率 2.13 倍の歪み）。枠を描くのは
> `renderIconFrame` だけで、これが `displayMode !== "icon"` で早期 return していたためである。
> 本 Issue は [ADR-2376](../adr/2376-icon-display-mode-de-emphasis-and-removal-path.md) が
> icon mode の deprecation 告知の前提条件に指定した移行先であり、TPL-2175 に従って告知を
> 同じ PR（= 同じ release）に載せる。

## 受け入れ条件

### AC-1: shape mode で宣言したカード枠が描かれる

- [x] AT-A: `background-color` / `border-color` / `border-width` / `border-radius` を宣言した `url()` ノードが、shape mode でその枠を描く

  > ✅ Automated — `packages/core/src/renderer/external-icon-card.test.ts` › external icon card (#2696) > shape mode > paints the declared card frame the icon body has nowhere to put

- [x] AT-B: その枠はノードの箱そのもの（エッジ・クロームが付く輪郭）であり、アイコン本体はその内側に収まる

  > ✅ Automated — 同 describe › draws that frame on the whole node box, so edges meet what is drawn

- [x] AT-C: icon mode と shape mode が同じ宣言色の枠を描く（モード間で違うのはカードの寸法だけ）

  > ✅ Automated — 同ファイル › external icon card (#2696) > icon mode is unchanged > paints the same declared frame as shape mode

### AC-2: アイコン本体が viewBox の比率を保つ

- [x] AT-D: shape mode の本体 transform が軸間で等しい（`scaleX === scaleY`）。カード自体は off-aspect のままである

  > ✅ Automated — `packages/core/src/renderer/external-icon-card.test.ts` › external icon card (#2696) > shape mode > keeps the icon body's viewBox ratio instead of stretching it to the card

- [x] AT-E: テキストスロット（`krs-label` / `krs-description`）が本体と同じ座標系に載る（絵だけ動いて文字が置き去りにならない）

  > ✅ Automated — 同 describe › puts the icon's text slots on the body they belong to

- [x] AT-F: スロットを持たないアイコンはカードの中央に置かれる

  > ✅ Automated — 同 describe › centres a slot-less icon, which has no layout of its own to line up

- [x] AT-G: 未登録の `url()` は `box` フォールバックのままで、枠が二重に描かれない

  > ✅ Automated — 同 describe › leaves a url() with no registered icon on the box fallback, with no second rect

### AC-3: icon mode が変わらない

- [x] AT-H: icon mode は固定カード（`160×56`）を本体で満たしたまま（`scale(1, …)`、原点はカード左上）

  > ✅ Automated — `packages/core/src/renderer/external-icon-card.test.ts` › external icon card (#2696) > icon mode is unchanged > still fills the fixed card with the icon body

- [x] AT-I: `displayMode` を通す全エントリポイントで、icon mode が固定カード・shape mode が測ったカードを描く（枠の有無はモードの判別にならなくなったので、判別子は寸法に移した）

  > ✅ Automated — `packages/core/src/displaymode-meta.test.ts` › meta: every displayMode-consuming SVG entry point threads displayMode › $name draws the fixed icon card in icon mode and a measured card in shape mode

- [x] AT-J: app の Full View / All Layers も同じ判別子で `displayMode` を通す

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > displayMode threading to Full View / All Layers › draws the fixed icon card in All Layers SVG, and a measured card in shape mode

### AC-4: 実機での見え方と告知

- [ ] AT-K: <https://karasu.kompiro.dev/> でスタイルに `service { shape: url("database"); }` を書き、shape mode のプレビューでノードがカードとして描かれ、ピクトグラムが歪まずカード左上に置かれる

- [ ] AT-L: 同じモデルを Settings → 表示 → アイコンカードに切り替えても、従来どおりの固定カードで描かれる（見え方が退行していない）

- [ ] AT-M: `background-color: transparent; border-width: 0;` を足すと枠が消え、アイコンだけがキャンバスに残る
