---
id: TPL-2492
title: "publish した実測値は原点込みで契約する — 高さを offset として読める形で配らない"
status: active
date: 2026-08-14
applicable_to:
  - "あるコンポーネントが実測値（高さ・幅・座標）を CSS 変数 / context / props で外に配り、別のコンポーネントがそれを使って自分の位置を決める構成"
  - "絶対配置の surface が、別の要素の寸法を基準に `top` / `left` を計算する画面"
known_consumers:
  - preview-toolbar
  - facet-overview-panel
discovered_from:
  - issue: "#2492"
  - root_cause_file: "packages/app/src/styles/components/panels.css:659"
related_to:
  - TPL-1468
topic: app-ui
scope:
  packages:
    - app
---

# TPL-2492: publish した実測値は原点込みで契約する — 高さを offset として読める形で配らない

## 観点

実測値を publish する側と使う側は、**値そのものは合っているのに意味がずれる**ことがある。
配られた数値には原点が書かれていないため、`height` として測った値を受け手が
「親の上端からの距離」として読んでも、どちらのコードも自分の中では正しいままになる。

配るときは **消費側が必要とする量そのもの**（多くの場合は offset）を、その意味が分かる名前で
publish する。高さと offset の両方を配って選ばせない — 選択肢があるかぎり、間違った方を
選ぶ経路が残る。

## 想定される失敗モード

- 「上端からの距離」を要求する CSS の `top` に、`height` として publish された変数が渡り、
  あいだにある兄弟要素（タブバー・ヘッダー）の分だけ surface が上にずれる。
  実例（#2492）: facet 所属一覧パネルが `top: calc(var(--preview-toolbar-h) + 8px)` で配置され、
  タブバー 36px を含まないためツールバーに 28px 食い込んだ。#2177 の実装当初から入っていた。
- ずれた分だけ**下にある操作面を覆う**ため、症状は「レイアウト崩れ」ではなく
  「ボタンが押せない」として現れる。レンダリング結果を見るテストは緑のまま。
- publish 側の値が正しいことを確かめるテスト（高さ = 61px）は通り続けるので、
  publish 側だけを見ていると発見できない。
- 消費側が 1 つしかないうちは「たまたま合っていた」状態が起こりうる。原点が同じ場合
  （兄弟要素が無い場合）に限り高さと offset は一致するため、要素が 1 つ増えた時点で壊れる。

## チェックリスト

実測値を外へ配る、または配られた値で位置を決めるとき:

- [ ] publish する変数名が、値の**意味**を表しているか（`-h`（高さ）ではなく `-bottom`（下端）のように）
- [ ] 消費側が必要とするのが offset なら、offset を publish しているか（高さを配って受け手に足し算させない）
- [ ] 同じ量について高さと offset の両方を publish していないか（選ばせない）
- [ ] publish 側のテストが、**原点を含む値**であることを検証しているか
      （間に別の要素がある状態を作り、値が単体の高さを上回ることを確認する）
- [ ] 配置がずれたとき、その surface が**別の操作面を覆う**かどうかを確認したか（覆うなら押せなくなる）

## 既知の対処パターン

- **offset だけを publish する**（#2492 の修正）。`PreviewColumn` は
  `--preview-toolbar-bottom`（`offsetTop + height`、`.preview-column` 上端が原点）だけを配り、
  高さは配らない。消費側に足し算の余地が無くなる。
- **jsdom でも原点を検証できる**。`getBoundingClientRect` と `offsetTop` を要素ごとに
  mock すれば、「タブバーがある状態で publish 値が高さを上回る」ことを単体テストで固定できる
  （`PreviewColumn.test.tsx` › `publishes the toolbar's bottom edge, which clears the tab bar above it`）。
- **重なり順は別問題**。どの層に置くかは [TPL-1468](TPL-1468-overlay-z-index-scale.md) が扱う。
  本観点は「そもそもどこに置くか」の側で、両方を満たして初めて surface が正しく浮く。
