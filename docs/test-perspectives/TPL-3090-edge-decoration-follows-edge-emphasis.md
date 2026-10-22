---
id: TPL-3090
title: "エッジに属する装飾をエッジのグループの外に描くなら、エッジの識別を持たせ、強調・減光に追随させる"
status: active
date: 2026-10-13
applicable_to:
  - "エッジの一部として読まれる記号（交差ホップ・合流の数・trunk band・エッジの外に出したラベルなど）を、`.krs-edge` のグループの外の別レイヤに描く変更"
  - "エッジを強調・減光する規則（hover・node focus・facet overlay・diff モード）を足す、または対象のセレクタを変える変更"
  - "複数のエッジの装飾を 1 つの要素にまとめる変更（どのエッジの装飾か分からなくなる）"
known_consumers:
  - crossing-marks
  - node-focus
  - facet-overlay
  - view-diff
discovered_from:
  - issue: "#3090"
  - issue: "#3157"
  - root_cause_file: "packages/app/src/components/focus-canvas/node-focus.ts"
  - root_cause_file: "packages/core/src/renderer/svg-renderer.ts"
related_to:
  - TPL-2956
  - TPL-2631
  - TPL-2174
  - TPL-1983
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-3090: エッジに属する装飾をエッジのグループの外に描くなら、エッジの識別を持たせ、強調・減光に追随させる

## 観点

> 起源は **#3090**（retrospective）。カードに hover するとそのノードに触れないエッジが沈み
> （#3031）、エッジに hover するとほかのエッジが沈む（#1186）。どちらも `.krs-edge` しか
> 選ばなかったので、別レイヤに描いた交差ホップ・合流の数・trunk band は明るいまま残った。
> 密な図では、沈んだ線の上に数十個の弧が残って無関係なエッジの経路をなぞり、焦点の
> ノードに属しているように読めた。

エッジの装飾は、描画順の都合で（線の上に描く、線の下に描く）エッジのグループの外に
置かれることが多い（ADR-1859、ADR-2631）。そうすると、エッジを選ぶ規則は装飾に届かない。
読者には装飾がエッジの一部に見えているので、線だけが沈むと「装飾は別のものに属している」
と読まれる。

装飾をグループの外に描くなら、**どのエッジに属するかを要素に持たせ**、エッジを強調・減光
する**すべての規則がその識別で装飾も選ぶ**。複数のエッジを運ぶ装飾（band・合流の数）は、
運ぶエッジのどれか 1 本が焦点なら焦点の経路の一部として明るく残す。

## 想定される失敗モード

- **線だけが沈み、装飾が明るく残る。** 規則が `.krs-edge` しか選ばない（#3090 の node focus と
  edge hover）。小さな図では装飾が少なく目立たないので、密な図で初めて気づく。
- **装飾が複数のエッジにまたがる 1 要素になっていて、選べない。** 出力を減らすために
  別のエッジの装飾を 1 本の `<path>` にまとめると（#2956 の案2）、焦点のエッジの装飾と
  無関係なエッジの装飾が一緒に明るく残るか、一緒に沈む。
- **装飾の透明度が presentation 属性の `opacity` で、CSS の減光がそれを置き換える。**
  `opacity="0.4"` の band に CSS で `opacity:0.12` を当てると 0.12 になるだけで、線（1 → 0.12）
  ほど沈まない。`stroke-opacity` なら掛け合わされる。
- **減光の仕組みが別の場所にもあり、そちらは装飾を見ていない。** facet overlay（renderer が
  エッジを `FACET_DIM_OPACITY` のラッパーで包む）と diff モードの `unchanged`（CSS で 0.55）は、
  #3090 の時点でまだ交差マークを沈めない。

## チェックリスト

エッジの装飾を描く変更、またはエッジの強調・減光の規則を変える変更で確認する:

- [ ] エッジのグループの外に描く装飾は、属するエッジの識別（karasu では `data-edges` に
      エッジの `data-edge-index` を空白区切りで）を持っている
- [ ] 1 つの要素が複数のエッジの装飾をまとめていない。まとめるなら、まとめる区切りに
      エッジを含めている
- [ ] エッジを強調・減光する規則を列挙し、それぞれが装飾も選ぶことをテストで確かめている
      （hover・node focus・facet overlay・diff モード）
- [ ] 複数のエッジを運ぶ装飾は、運ぶエッジのどれかが焦点なら明るく残る
- [ ] 装飾の透明度が CSS の `opacity` と掛け合わされる形（`stroke-opacity` / `fill-opacity`）で
      書かれている

## 既知の対処パターン

- **識別を持たせて、規則に足す**（#3090）: 交差マークに `data-edges`、マークが参照するエッジに
  `data-edge-index` を付ける。node focus は焦点のエッジの index を集めて
  `[data-edges]:not(:is([data-edges~="3"],…))` を沈め、edge hover は hover したエッジの index で
  同じ規則を書く。CSS は hover したエッジの属性値を別の要素と照合できないので、edge hover の
  装飾側は JS（`node-focus.ts`）で書く。発火条件は `EDGE_HOVER_TRIGGER` 1 つにまとめた。
- **出力の代償を測る**: Dify の全ビューで +4.29%（ホップをエッジでも区切る分 +2.06%、識別の
  属性 +2.16%）。

## 関連テスト

- `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks name their edges (#3090)`: chip・band・ホップが
  運ぶエッジを `data-edges` に持ち、その index のエッジだけが `data-edge-index` を持つこと
- `packages/core/src/renderer/svg-renderer.test.ts` › `crossing hop paths (#2956)` › `starts a new <path> whenever the host edge changes, even in one stroke (#3090)`
- `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks follow their edges' dim (#3157)`: facet overlay と
  diff モードでも、マークは名指すエッジがすべて薄いときだけ薄くなること（どちらも無いときは出力が変わらない）
- `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx`: node focus と edge hover の規則が
  無関係なマークだけを選ぶこと
- `packages/e2e/tests/at-3090-crossing-marks-follow-edge-focus.spec.ts`: Chromium で computed opacity が
  0.12 / 0.25 になり、焦点のマークは 1 のままであること
