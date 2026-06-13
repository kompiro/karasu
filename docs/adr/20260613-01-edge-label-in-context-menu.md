---
id: ADR-20260613-01
title: エッジコンテキストメニューへの authored ラベル表示と data-edge-label の authored 専用化
status: accepted
date: 2026-06-13
topic: edges
related_to:
  - ADR-20260422-03
  - ADR-20260410-01
scope:
  packages:
    - core
    - app
assumptions:
  - "grep: packages/core/src/renderer/edge-routing.ts :: data-edge-label"
  - "symbol: packages/core/src/types/ast.ts :: syntheticLabel"
  - "symbol: packages/app/src/components/EdgeContextMenu.tsx :: EdgeContextMenu"
  - "file: docs/acceptance/1554-edge-label-in-context-menu.md"
---

# ADR-20260613-01: エッジコンテキストメニューへの authored ラベル表示と data-edge-label の authored 専用化

- **日付**: 2026-06-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #1554
  - ADR-20260422-03: 集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式
  - ADR-20260410-01: Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/core/src/types/ast.ts`（`KrsEdge.syntheticLabel`）
  - `packages/app/src/components/{PreviewPane,EdgeContextMenu}.tsx`
  - `docs/acceptance/1554-edge-label-in-context-menu.md`

## 背景

キャンバス上に描かれるエッジラベルは、ラベル同士の重なり・長文・他要素との
交差で判読できなくなることがある。そのときユーザーが取る自然な回復手段は
「エッジを右クリックして詳細を読む」だが、`EdgeContextMenu` のヘッダーは
`from → to`（ノード id）と `edge#<canonicalId>` しか表示しておらず、`.krs` に
記述したラベル文字列はメニューのどこにも出ていなかった。さらにレンダラーは
エッジの SVG グループに `data-edge-{from,to,kind,canonical-id}` しか出力して
おらず、app がメニューを組み立てる時点でラベル情報が手元に無かった（#1554）。

レビューで二つの論点が出た。第一に、エッジの `label` フィールドには `.krs`
由来の authored ラベルだけでなく、**機械生成ラベル**も入る点。具体的には
usecase→resource 合成エッジの `W`/`R` マーカーと、集約された暗黙エッジの
`N domain edges` カウントである。これらをそのまま新属性に流すと、メニューが
合成マーカーを「ユーザーが書いたラベル」であるかのように引用表示してしまう。
第二に、長いラベル・日本語ラベルでメニュー幅が破綻しうる点。

## 決定

エッジコンテキストメニューに **authored ラベルのみ**を表示する。配管は
ADR-20260422-03 が `data-domain-edges` で確立した「SVG data 属性にモデル情報を
埋め込み、app がイベント時に読む」方式を踏襲し、レンダラーが edge グループに
`data-edge-label` を出力、`PreviewPane` がそれを読んで `EdgeContextMenu` の
ヘッダーに引用表示する。

authored / synthetic の境界は **core 側のフラグ**で持つ。`KrsEdge`（および
`LayoutEdge`）に `syntheticLabel?: boolean` を追加し、`W`/`R` マーカーと
`N domain edges` カウントを生成する箇所で `true` を立てる。レンダラーは
`syntheticLabel` のエッジでは `data-edge-label` を出力しない。これにより
属性の意味は「authored ラベル専用」に確定する。合成マーカーは従来どおり
キャンバス上の `<text>` には描かれる（表示はする、属性には出さない）。

メニュー幅は `.edge-context-menu` に `max-width: 320px`、ヘッダーに
`overflow-wrap: anywhere` を付けて折り返しで吸収する。

## 理由

- **属性方式は既存系譜と一貫**。ADR-20260422-03 が集約暗黙エッジの内訳を
  `data-domain-edges` として SVG に埋め込み、クリック時に app が読む方式を
  既に採っている。エッジ単位のメタを data 属性で運ぶのは新規パターンの
  発明ではなく、確立済みの配管の素直な拡張である。
- **境界を core に置くと表示専用属性の意味が安定する**。authored か synthetic
  かはレンダラーや app が後付けで判定するより、ラベルを生成する core が
  知っている事実である。フラグを source に置けば、`data-edge-label` を読む
  どの consumer（context menu に限らず、将来のエクスポート / レポート等）も
  「これは authored ラベル」と前提でき、合成マーカーの混入を構造的に防げる。
- **エッジの識別は引き続き `canonicalId`、ラベルは表示専用**。今回の変更は
  この境界（TPL-20260510-20）を保つ。`data-edge-label` の有無や内容は識別に
  使わず、欠落してもメニューの挙動は壊れない。
- **集約数 1 のパススルーは authored ラベルを保持する**。暗黙エッジでも
  domain 間エッジが 1 本だけ通る場合は `.krs` のラベルがそのまま残るので、
  `syntheticLabel` は立てず属性に出す。「合成」は複数集約時の
  `N domain edges` だけに限定する。

## 却下した案

- **app 側で `W`/`R` を弾く** — メニュー描画時に「1 文字なら出さない」等の
  ヒューリスティックで合成マーカーを除外する案。バンドエイドであり、合成
  ラベルの定義が app に漏れる。`N domain edges` のような複数文字の合成
  ラベルには効かず、判定が脆い。境界は生成元（core）に置くべきと判断した。
- **`data-edge-label` を無条件に出力する（synthetic も含めて出す）** —
  最小実装だが、メニューが合成マーカーを authored ラベルとして引用表示する
  問題が残る。属性の意味が「描画ラベル全部」に薄まり、consumer が authored
  か否かを区別できなくなる。
- **メニュー幅を固定する / ラベルを省略表示（truncate）する** — 折り返しの
  代わりに固定幅 + 省略記号で詰める案。判読性の回復が目的なのに長いラベルが
  読めなくなり本末転倒。`overflow-wrap` で全文を折り返す方を採った。
