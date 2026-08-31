---
id: ADR-2269
title: team フレームの色は team カードと同じセレクタで指定する — `team` / `#<id>` / `team#<id>`
status: accepted
date: 2026-08-31
topic: styling
depends_on: [ADR-9004, ADR-1858, ADR-2234]
related_to: [ADR-1314, ADR-2124]
scope:
  packages: [core]
  concerns: []
assumptions:
  - "symbol: packages/core/src/resolver/style-resolver.ts :: resolveTeamFrames"
  - "symbol: packages/core/src/types/style.ts :: ResolvedTeamFrames"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: resolveTeamFramePaint"
  - "symbol: packages/core/src/renderer/layout-types.ts :: ContainerRect"
  - "symbol: packages/core/src/builtins/reference-data.ts :: SELECTOR_SPECIFICITY"
  - "file: packages/core/src/renderer/team-frame-style-selector.test.ts"
  - "grep: docs/spec/style.md :: Team frames"
---

# ADR-2269: team フレームの色は team カードと同じセレクタで指定する — `team` / `#<id>` / `team#<id>`

- **日付**: 2026-08-31
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2269](https://github.com/kompiro/karasu/issues/2269)（[#2234](https://github.com/kompiro/karasu/issues/2234) から分離）
  - ADR: [ADR-2234](2234-boundary-style-selector.md)（boundary フレームの style セレクタ。本件を分離した相手）、[ADR-1858](1858-system-view-group-by-team.md)（*Group by: team* と team フレーム）、[ADR-9004](9004-css-inspired-styling.md)（CSS インスパイアの styling）、[ADR-1314](1314-krs-spec-v1-freeze.md) / [ADR-2124](2124-version-vocabulary.md)（言語版）
  - AT: [2269-team-frame-style-selector.md](../acceptance/2269-team-frame-style-selector.md)
  - TPL: [TPL-2269](../test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md)（本件の proactive — 出荷側の既定値を 2 つ目の描画面に漏らさない）、[TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
  - spec: `docs/spec/style.md` §「Team frames (*Group by: team*)」（+ja）

## 背景

[ADR-2234](2234-boundary-style-selector.md) は boundary フレームに `boundary` /
`boundary#<id>` を与えたが、team フレームを同じ回で扱うことは却下して
[#2269](https://github.com/kompiro/karasu/issues/2269) に分けた。理由は綴りの決定が
必要かどうかが両者で違うことにある。boundary はノードではなく `#pci` は誰にも届かない
ので、キーワードが id 空間を名指す形しかない。一方 **team はノードである** — org tree
view でカードの kind として既に style 語彙であり、`#Platform` がそのカードを塗っている。
したがって `team#Platform` の CSS 的に自然な読みは「カードを絞る複合セレクタ」であって、
そこにフレームという別対象を割り当てると `#Platform`（カード）との非対称が生まれる。

Issue が挙げた選択肢は 3 つ: (1) カードとフレームで 1 つのスタイルを共有する、
(2) 擬似要素（`team#Platform::frame`）でフレームを別対象として綴る、(3) フレーム専用の
別キーワードを置く。

## 決定

**案 1 を採る。** team は 1 つのエンティティで、org tree view のカードと system view
*Group by: team* のフレームはその 2 つの描画である。セレクタはエンティティを指し、
どちらの描画になるかはビューが決める。新しい文法機構は導入しない。

- **`team` / `#<id>` / `team#<id>` の 3 つがカードとフレームの両方に届く。** `team#<id>`
  は複合セレクタで、値は専用フィールドではなく `StyleSelector.id` に入る。specificity は
  既存の採点式（id +100、kind +1）のまま 101 になり、`computeSpecificity` は無変更。
- **フレームに効くのは `border-color` / `background-color` / `color` / `border-width` /
  `border-style` の 5 つ**。boundary フレームと同じ部分集合で、`shape` / `opacity` /
  `border-radius` / `font-*` / `badge-*` はカード専用。
- **各プロパティは、カード側で塗る部分に対応するフレーム側の部分に届く**:
  `border-color` → 輪郭、`background-color` → 薄い塗り、`color` → タイトル。
  ここが `resolveBoundaryPaint` と分岐する唯一の点で、あちらは `border-color` 1 つが
  3 つすべてを駆動する。
- **既定値は描画ごとに別。フレームの解決は著者シートだけを読む**（`sheetId` が
  `<builtin>` / `<icon-theme>` のシートを除外する）。
- **`ResolvedStyles.teamFrames` を `boundaryFrames` の隣に足す。** ADR-2234 が予告した
  とおり `boundaryFrames` の構造は変えない。
- **`ContainerRect.groupAxis` を新設**し、フレームがどちらの軸で作られたかを記録する。
- **言語版は動かさない。** 既存セレクタの到達範囲が広がるだけで、`.krs.style` の語彙は
  `team#<id>` の 1 形しか増えず、これは既存の 2 部品の組み合わせである。

## 理由

- **`#Platform` と `team#Platform` が同じものを指す**という CSS の直観を保てる。案 2 / 案 3
  はフレームを別オブジェクトとして綴るので、この直観を捨てる代わりに新しい文法機構
  （`::` トークンと specificity 規則、あるいは語彙 1 つ）を買うことになる。しかも案 2 を
  採ると boundary 側も対称性のために `boundary#pci::frame` を負う。
- **team は 1 エンティティなので、見た目も 1 つであってほしい**（TPL-2234）。カードと
  フレームを別々に塗り分けたい要求は Issue にも実利用にも現れていない。
- **各プロパティがカードに倣う**ので、1 つの宣言から読み手が結果を予測できる。boundary の
  「`border-color` が塗りまで駆動する」規則は重なりの可読性という固有の制約から来ており
  （[#2179](https://github.com/kompiro/karasu/issues/2179)）、team 軸は 1:1 で重ならない
  以上その制約が無い。制約が無いところに同じ例外を持ち込む理由がない。
- specificity 表は手書きせず `reference-data.ts` の `SELECTOR_SPECIFICITY` に 1 行足して
  `pnpm gen:reference` で en / ja を再生成した（TPL-1296）。

## 既定値は描画ごとに別（本件の load-bearing な点）

案 1 を文字どおり「1 つのスタイルを共有」と実装すると壊れる。builtin シートは既に
`team { background-color: #D1FAE5; border-color: #6EE7B7; … }` を宣言しており、これは
**カードの**既定値で、フレームという概念が無かった時代に書かれている。フレームが
解決済みの `ResolvedNodeStyle` を読むとこれも一緒に取り込み、著者が何も書いていないのに
全 team フレームが緑になる。[#2179](https://github.com/kompiro/karasu/issues/2179) が決めた
「team フレームは単色」にも、Issue 自身の受け入れ条件「名指ししなかったチームは不変」にも
反する。

そこで **カードの既定値は builtin シート、フレームの既定値はレンダラー**（ADR-1858 の
控えめな破線）と分け、両者を渡り歩くのは著者の宣言だけとする。`ResolvedTeamFrames` は
全フィールド optional で、「未指定」と「既定値」が区別できる形で持つ。

boundary が同じ filter を必要としなかったのは、builtin シートに漏れる `boundary` ルールが
無かったからにすぎない。立場は両軸で同じである。この観点は
[TPL-2269](../test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md)
に proactive TPL として起こした。

## 軸の判別はフレームに記録する

`ContainerRect.groupId` は boundary 軸では boundary の id、team 軸では org のチーム id を
指し、2 つは別の id 空間である。`hueIndex` の有無で軸を推測する案は誤りで、展開中
キャンバス（[#1921](https://github.com/kompiro/karasu/issues/1921)）の boundary フレームは
hue を持たないため team 軸と誤判定され、ノードを名指した `#<id>` ルールがそこへ漏れる。
`groupAxis` を `buildGroupFrames` が書き込み、レンダラーはそれで分岐する。展開フレームは
どちらの軸でもないので `groupAxis` を持たず、どちらのマップも引かない。

## 副産物: `boundary#<id>` の formatter 取りこぼし

`team#<id>` の往復（TPL-1101）を確認する過程で、`formatSelector` が
`StyleSelector.boundaryId` を出力していないことが分かった。ADR-2234 で入った
`boundary#pci { … }` は `karasu fmt` を通すと `boundary { … }` になり、**1 つの boundary
に当てた規則が全フレームに広がる**。同じ関数で `id` / `edgeId` / `boundaryId` を並べて
出力するよう直し、退行テストを `boundary-style-selector.test.ts` に追加した。

あわせて `warnings.ts` の `serializeSelector`（style-conflict のグルーピングキー、かつ
警告に表示される文字列）を `formatSelector` への委譲に畳んだ。両者は既に食い違って
おり、こちらは id を kind より前に置き（`team#Platform` が `#Platformteam` になる）、
`edge#<id>` / `boundary#<id>` を落としていた。落とすと別々の boundary を名指した 2 枚の
シートが同じ `boundary` キーに融合し、実在しない conflict を報告する。1 つのセレクタの
綴りは 1 つにする（TPL-2234）。

## 却下した案

- **擬似要素（`team#Platform::frame`）**: カードとフレームを完全に分けられるが、`::`
  トークン・セレクタ部品・specificity 規則という新しい文法機構が要る。しかも boundary 側も
  対称性のために `boundary#pci::frame` を負うことになる。分けたい要求が現れていない段階で
  払うコストとして高い。
- **フレーム専用の別キーワード（`team-frame#Platform` 等）**: 擬似要素の機構は要らないが、
  1 つのエンティティに 2 つのキーワードを置くことになり、読み手は「`team` と `team-frame`
  は同じチームの 2 つのビュー」と学ぶ必要がある。v1 で凍結した言語表面に語彙を 1 つ
  消費する割に得るものが無い。
- **フレームがカードの解決済みスタイルをそのまま読む**: 「1 つのスタイルを共有」の最も
  素朴な形。builtin の既定値まで取り込むので、上記のとおり既定の見た目が変わる。
  `border-radius` / `border-width` も一緒に取り込むため、フレームがカードの角丸を
  持とうとする実害もある。
- **`<kind>#<id>` を一般に受け入れる（`service#foo` 等）**: `team#<id>` の一般化として
  自然に見えるが、本 Issue の受け入れ条件には含まれず、`.krs.style` 全体の綴り方に関わる
  別の決定である。今回は `team` のみを受け入れ、パーサは `boundary` / `edge` と同じく
  キーワード名指しの分岐にとどめた。
- **`team {}` をフレームに届かせない（id 名指しだけ届く）**: builtin シート漏れを
  `sheetId` の判定なしに避けられるが、`boundary {}` が全フレームに効くのと非対称になり、
  *Group by: team* で全フレームの線種を一括で変える手段が無くなる。
