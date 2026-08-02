---
id: TPL-2174
title: "opt-in な視覚レイヤは、無効時に自分のマーカーを 1 つも出さない"
status: active
date: 2026-08-02
applicable_to:
  - "レンダラに opt-in の視覚レイヤ（overlay / 強調 / 減光 / 追加の legend ブロック）を足すとき"
  - "既存の描画オプション（diff mode・Group-by・collapse・facet overlay）の出力属性やラッパー要素を変更するとき"
  - "「このオプションを指定しなければ今までどおり」と PR / changeset に書こうとしたとき"
known_consumers:
  - facet-overlay
  - svg-renderer
discovered_from:
  - issue: "#2174"
  - root_cause_file: "packages/core/src/renderer/svg-renderer.ts"
related_to:
  - TPL-1402
  - TPL-1983
  - TPL-1503
topic: renderer
scope:
  packages:
    - core
---

# TPL-2174: opt-in な視覚レイヤは、無効時に自分のマーカーを 1 つも出さない

## 観点

karasu の描画オプションは「指定しなければ今までどおり」を前提に積み重なっている。
その前提は PR description に書くだけでは守れない — 属性 1 個・空の `<g>` 1 個の
混入は、200 行の SVG の diff を目視するレビューでは**見えない**。

このとき **2 つの別々の退行**があり、どちらか一方のテストでは他方を捕まえられない。

1. **モデル側の摂動** — その機能のための記述（`facet` 宣言など）がモデルにあるだけで
   出力が変わってしまう。配置がずれる、無関係な属性が増える。
2. **無条件の出力** — 機能が**無効なのに**自分のマーカーを出す。属性が全ノードに
   付く、空のラッパーが挟まる、legend band が高さ 0 で描かれる。

**(1) は「その記述を持つモデル」と「持たないモデル」のレンダリング結果の一致で
捕まえられる。(2) は捕まえられない。** 両辺が同じバイナリを通るので、全ノードに
付いた属性は両辺に等しく現れて**相殺**するからである。

(2) を捕まえるには、そのレイヤが出しうる**マーカーを名前で列挙し、無効時に 1 つも
現れないことを assert する**しかない。

```ts
/** そのレイヤが出しうるマーカー。無効時にどれも現れてはならない。 */
const OVERLAY_MARKERS = ["data-facet-member", "data-facet-ring", 'opacity="0.28"'];

it("emits none of its own markers when the layer is off", () => {
  const svg = renderWithLayerOff();
  for (const marker of OVERLAY_MARKERS) expect(svg).not.toContain(marker);
});
```

## 想定される失敗モード

- **相殺による見逃し**: 等値テストだけを置き、「バイト単位で同一を確認済み」と
  PR に書く。実際には無条件出力を一切検出していない。
  [#2174](https://github.com/kompiro/karasu/issues/2174) で実測した — overlay が
  無効なときに `data-facet-member="none"` を全ノードへ出す変異は、等値テストも
  **3000 件の全スイートも通過した**。マーカー列挙の assert だけが落ちた。
- **マーカー列挙の取りこぼし**: 属性は挙げたが減光の `opacity` 値やラッパー要素を
  挙げず、そこだけ無条件出力が残る。**そのレイヤが出す DOM の種類**を数え上げる。
- **サーフェス単位の抜け**: live 描画では無効化されるが、静的バンドル
  （all-layers / all-views / drill-down）では常に出る。無効時の assert も
  **サーフェスごとに**置く（[TPL-1983](TPL-1983-view-state-gate-parity-across-surfaces.md)）。
- **復路の未検証**: 有効化のテストはあるが、**解除して元に戻る**ことを見ていない
  （[TPL-1402](TPL-1402-involutive-toggle-renders-both-states.md)）。
- **無効と「空だが有効」の混同**: 選択が空でもレイヤを「有効」として構築し、空の
  legend band や高さ 0 のラッパーを出す。**無効は `undefined` に畳む** —
  「空だが存在する」状態を型として作らないのが最も確実。

## チェックリスト

opt-in な視覚レイヤを足す / 触る PR で:

- [ ] そのレイヤが出しうるマーカー（属性名・class・特徴的な値）を配列で列挙し、
      無効時に 1 つも現れないことを assert している。
- [ ] その assert が実際に落ちることを**変異で確認**した（無効時にマーカーを 1 つ
      出す変更を入れてテストが赤くなる）。等値テストしか無い場合は特に。
- [ ] 「その記述を持つモデル」と「持たないモデル」の出力一致も別途置いている
      （上記 (1)）。
- [ ] 有効 → 無効で元に戻ることを見ている（TPL-1402）。
- [ ] 静的バンドルを含む**全サーフェス**で無効時の assert がある（TPL-1983）。
- [ ] 「無効」を `undefined` に畳んでおり、空だが有効な状態が型として作れない。

## 派生元 spec

- `docs/spec/syntax.md` §*Cross-cutting membership (`facet`) — experimental* /
  `docs/spec/syntax.ja.md` §*横断的な所属（`facet`）— experimental* —
  「選択はビューア側の状態であり、モデルには書かない」「同じ `.krs` は誰かが選択する
  まで同じように描画される」と規定している節。本 TPL はその後半を機械で縛る。
