---
id: ADR-2366
title: node chrome は 1 本のコーナーレーンに畳み、色は色相表から導き、ポートは描画輪郭に置く
status: accepted
date: 2026-08-13
topic: renderer
authors: [kompiro]
related_to:
  - ADR-1479
  - ADR-30
  - ADR-1000
  - ADR-968
  - ADR-1821
  - ADR-2330
assumptions:
  - "file: packages/core/src/renderer/corner-lane.ts"
  - "file: packages/core/src/renderer/port-frame.ts"
  - "file: packages/core/src/renderer/degraded-tabs.ts"
  - "symbol: packages/core/src/shapes/shape-registry.ts :: getShapePortFrame"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: nodeControls"
---

# ADR-2366: node chrome は 1 本のコーナーレーンに畳み、色は色相表から導き、ポートは描画輪郭に置く

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2366](https://github.com/kompiro/karasu/issues/2366)（node 視認性バッチ。Phase 1〜3 は #2386 / #2399 / #2412 で出荷済み、本 ADR は Phase 4）
  - 設計 PR: [#2417](https://github.com/kompiro/karasu/pull/2417)。実装スライス: [#2420](https://github.com/kompiro/karasu/issues/2420) / [#2421](https://github.com/kompiro/karasu/issues/2421) / [#2422](https://github.com/kompiro/karasu/issues/2422)（PR [#2444](https://github.com/kompiro/karasu/pull/2444) / [#2441](https://github.com/kompiro/karasu/pull/2441) / [#2452](https://github.com/kompiro/karasu/pull/2452)）
  - [ADR-1479](1479-svg-diagram-theming.md)（テーマ機構）、[ADR-30](30-icon-mode.md) / [ADR-1000](1000-icon-mode-layout-gap-tuning.md)（アイコンモードは固定カード）
  - [ADR-968](968-orthogonal-edge-routing-skip-layer.md)（直交ルーティングとポート配分）、[ADR-2330](2330-ungrouped-routing-parity.md)（候補列と計測柵）、[ADR-1821](1821-layer-toggles.md)（対話クロームは `interactive` 限定）
  - TPL: [TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)、[TPL-2421](../test-perspectives/TPL-2421-kind-color-hue-table.md)、[TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md)、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)
  - AT: [AT-2420](../acceptance/2420-node-corner-lane.md) / [AT-2421](../acceptance/2421-kind-hue-vocabulary.md) / [AT-2422](../acceptance/2422-shape-port-frames.md)

## 背景

#2366 の node 視認性バッチで、Phase 1〜3 が「カードの中身」（切り詰め・絵文字依存・
コントラスト）を片付けた後に 3 問題が残った。いずれも**カードの縁とその外側** =
node chrome の問題で、互いに幾何を共有する。

- **P5 コーナーチップ渋滞**: アノテーションバッジは右上角の**外側**に浮く円で、
  上から入るエッジや隣接ノードと重なる。同じ角に info / deploy ボタンが独立に
  置かれ、どちらが読めるかは描画順次第だった。静的出力にも押せないボタンが出る。
- **P7 kind 色語彙の空洞化**: dark テーマで `domain` / `usecase` / `resource` /
  `member` が完全同一配色。deploy kind の地色は彩度を落とした濁色（war の茶、
  function のオリーブ）で、accent とどの色相でも繋がっていない。割り当て規則が
  存在せず、kind を足すたびに場当たりになる。
- **P10 接続点の不明瞭**（ユーザー報告）: ポートは bounding box 上に置かれる。
  長方形ならそれが輪郭だが、user カードではメダリオン脇の「何もない空間」、
  cylinder では上楕円の上でエッジが止まる。

## 決定

3 領域とも「宣言的な幾何 + 単一規則 + 機械検証」で解く。Phase 1〜3 が
`contentInset` とコントラストガードで採った形の踏襲である。

1. **右上角を欲しがる要素は 1 本の右詰めレーンの住人にする**（#2420）。
   `[i] [D] [chip]` を 4px ギャップで詰め、各要素は自分より右の住人の占有幅ぶん
   オフセットする。**重なりは描画順ではなく幾何として起こらない。** バッジは
   カード外に浮く円をやめ、カード内側のピル（インセットチップ）にする。
2. **kind 色は 2 つの導出規則と色相表から導く**（#2421）。論理層は色相ではなく
   塗りで分ける（`usecase` は塗りなし、`resource` は中立 slate、`domain` は navy
   継続）。deploy kind は 1 つの色相を 3 通りに使う — accent は満彩度、地は低明度、
   ラベルは高明度。表は `docs/spec/style.md` に置き、ガードが hex を検証する。
3. **シェイプが辺ごとに輪郭の在処を宣言し、ポートはそこに座る**（#2422）。
   `portFrame(w, h)` が「輪郭が覆う区間（spans）」と「そこでの食い込み（depth）」を
   返し、`contentInset` の兄弟として同じ描画関数から写す。カード自身のクローム
   （コーナーレーン、縮退タブ帯）は keep-out。

## 理由

- **単一規則は事後確認を要らなくする。** レーン共有は「重なっていないか」を毎回
  見る作業を消す。色相表は「この kind の地色は何色か」を導出に変える。portFrame は
  シェイプ追加時の拡張点を `contentInset` と対で揃える。
- **機械検証を規則と同じ PR で置ける。** レーンは住人の矩形が重ならないこと、色は
  インクとピル/canvas のコントラスト、ポートは描画輪郭上に載ることを、いずれも
  幾何/数値で assert できる。ADR-2330 の計測柵（貫通 0 / overlap 0）も維持した。
- **既定の見え方を壊さない範囲が明確になる。** 長方形だけの図はポート座標が
  1px も動かない（`box` は portFrame を宣言しない = bounding box が輪郭）。

## 実装で設計を覆した点

設計 PR #2417 の想定のうち、実装が反証したもの。ADR に残すのはこの差分こそが
次に同じ判断をする人の役に立つため。

- **i / D ボタンは `interactive` に相乗りできない**（#2420）。設計は「新オプション
  不要」としたが、`interactive` はカテゴリ collapse を実装している viewer を指す
  フラグで、VS Code webview は `data-info-button` を扱うのに collapse は持たない。
  相乗りさせると webview から ⓘ を奪うか、押しても何も起きない ⊖ を与えるかの
  二択になる。専用の `nodeControls` を切り、扱う surface が opt-in する形にした。
- **チップの文字は白固定にできない**（#2420）。設計は solid ピル + 白文字としたが、
  badge-color は「テーマの canvas 上で読める色」として選ばれており、その**上に**
  白を載せると dark の 20 色すべてが 4.5:1 を割る（`#F59E0B` で 2.15:1）。インクは
  ピル色に対して白/濃インクの高い方を選ぶ規則にした。
- **塗りなし kind の枠線は PoC 較正値では足りない**（#2421）。PoC は boundary tint
  1 枚・フェードなしで検証していたが、membership は 1:N なので tint は重なり、
  `@deprecated` はノード群ごと薄くする。塗りなしカードはフェード後「薄い輪郭 1 本」
  になるため、自ハue ramp 上のより明るい/暗い点へ移した。
- **portFrame は配分の入力を差し替えるだけでは効かない**（#2422）。設計は「配分
  アルゴリズムは変えず入力だけ差し替える」としたが、ADR-2330 の候補列は再経路化
  したエッジのポートを自前で置き直す。配分前のマッピングに加えて**ルーティング後の
  座り直しパス**が要る。
- **輪郭とクロームは強さが違う**（#2422）。keep-out のために単独の直線エッジを
  斜めにすると、直角が語彙の図で明確な退行になる（ガイド図の before/after で観測）。
  輪郭は事実なので傾けてでも寄せ、keep-out は選好なので曲がりが吸収できるときだけ
  寄せる。
- **cloud は「輪郭マージン」では潜る**（#2422、ユーザー報告）。content-safe 矩形は
  塗りの奥深くにあり、矢印の先端が blob に隠れた。波打つ輪郭にも**光線ごとには**
  境界が一意なので、描画カーブを平坦化して交差させる。あわせて「depth は宣言した
  span の内側でしか意味を持たない」を規則化した（span 外では反対側のローブと
  交差して端点を埋める）。

## 却下した案

- **H-1 案B: バッジ位置は変えず keep-out だけ導入。** バッジがカードの外にある以上、
  隣接ノードとの衝突は解決不能。「バッジのぶんの余白予約」が全ノードに波及して
  案A より複雑になる。
- **H-2 案B: 同一 4 kind の分離だけ行う。** deploy の濁色が残り、色相規則が無いまま
  なので次に kind を足すときまた場当たりになる。
- **P10 案B: keep-out のみ（portFrame なし）。** 主訴（輪郭から浮く）が残る。#2412 で
  user カードの内側を直した直後に、外側だけ bounding box のままにする不整合。
- **チップの tinted 背景**（PoC 段階）。文字色がカード地との合成地に乗るため、
  コントラスト保証が合成込みの複合条件になる。solid なら「インク ⇔ ピル」の 1 軸。
- **spike preview で PoC レポートを配信**（#2419 で別途整理）。本 ADR の範囲外。
