---
id: TPL-2818
title: "ビューをまたいで id を手渡すときは、受け手のビューが要素に載せている id 空間の値を手渡す"
status: active
date: 2026-09-26
applicable_to:
  - "あるビューの要素から取った id を別のビューに渡し、そこで要素を引く（ハイライト・スクロール・選択・drill）コード"
  - "1 つの id 文字列を複数の `data-*` 属性や複数の Map に順に当てて『どれかに当たる』ことに頼る lookup"
  - "URL hash / share payload / message のように、id を持ち運ぶ経路が『どの id 空間か』を型に持たない場所"
  - "identity のために id の綴りを変える（修飾・引用符・injective な畳み込み）決定を、その id を読む消費側に延長するとき"
known_consumers:
  - cross-navigation-highlight
  - deploy-jump-button
  - deploy-container-click
  - vscode-preview-highlight
discovered_from:
  - issue: "#2818"
  - issue: "#2549"
  - issue: "#2714"
  - root_cause_file: "packages/app/src/components/PreviewPane.tsx:518"
related_to:
  - TPL-1666
  - TPL-1352
  - TPL-1755
  - TPL-2789
topic: navigation
scope:
  packages:
    - app
    - core
    - vscode
---

# TPL-2818: ビューをまたいで id を手渡すときは、受け手のビューが要素に載せている id 空間の値を手渡す

## 観点

ビューをまたぐ導線（deploy のコンテナ → system のノード、system の D ボタン → deploy の
コンテナ、詳細パネル → 別ビュー、hash の `:<highlight>` の復元）は、**送り手のビューの
要素から取った id** を **受け手のビューの要素に当てる**。このとき 2 つのビューが要素に
載せている id は同じ id 空間とは限らない。

- system ビューのノードは author-given な **bare id**（`data-node-id`）
- deploy ビューのコンテナは **identity**（`data-container-id`）で、bare id と同じ綴りに
  なるのは修飾も引用符も要らない場合だけ（#2549 で修飾 `Shop.Api`、#2714 で引用符付き
  `"www.example.com"` が入った）
- deploy ビューの unit は `<container>::<unit>` で修飾されるが、unclassified の unit は
  **bare な unit id** を `data-node-id` に持つ。ノードの id と綴りが同じでも別の空間

観点は 1 つ: **手渡す側が、受け手のビューがその要素に載せている id 空間の値を渡す。**
受け手が 1 つの文字列を複数の属性に順に当てて吸収するのは、id 空間が偶然一致している
あいだしか動かず、identity のために綴りを変えた瞬間に外れる（TPL-1352 が injective に
した id は、まさにその瞬間に他の空間と綴りが揃わなくなる）。

TPL-1666 は同じ「同じ実体を複数の id 形で持つ」構造の **lookup 側** の観点（格納側の
すべての形を試す）。本 TPL は **手渡す側** の観点で、形が bare / 修飾 / 引用符と増えて
受け手から逆変換できなくなった場面で効く。

## 想定される失敗モード

- deploy コンテナのクリックがコンテナの identity（`Shop.Api` / `"www.example.com"`）を
  ハイライト id として system ビューに渡し、ノードの `data-node-id`（`Api` /
  `www.example.com`）に当たらず、ビューは切り替わるが何も光らない（#2818）
- D ボタンが渡した bare id を deploy ビューが `data-container-id` の fallback で引き、
  修飾・引用符付きのコンテナに当たらない（#2818）。素の id でしか動かないので、
  AT が素の id だけを通すと検出できない
- 受け手側で `[data-node-id=X] ?? [data-container-id=X]` のように空間をまたいで
  fallback すると、`oci Api {}`（unclassified、`data-node-id="Api"`）がノード `Api` 宛の
  ハイライトを横取りし、コンテナが光らない
- hash の `:<highlight>` に author-given でない綴り（引用符付き、percent-encode 済み）が
  載り、共有 URL や履歴復元で別の id 空間として解釈される
- 同じ導線を持つ別の表示面（VS Code webview の `switchViewAndHighlight`）が、app 側の
  修正から漏れて同じ穴を残す

## チェックリスト

id をビューをまたいで手渡す導線を足す / 触るとき:

- [ ] 手渡す値の id 空間を **受け手のビューの要素属性** で言えるか（「system の
      `data-node-id`」のように）。送り手の要素から取った値をそのまま渡していないか
- [ ] identity のために綴りを変えた id（修飾・引用符・injective な畳み込み）を持つ
      要素には、**突き合わせ用の id を別属性で載せた**か。突き合わせを identity から
      逆変換で求めていないか（ADR-2714: identity と突き合わせは別の id）
- [ ] 受け手の lookup は **そのビューの 1 つの属性** を引くか。複数の属性 / Map を順に
      試す fallback で空間の違いを吸収していないか（同じ綴りの別空間の要素が横取りする）
- [ ] 持ち運ぶ経路（hash / share payload / postMessage）に載る値が **1 つの id 空間** に
      固定されているか。送り手のビューによって空間が変わる設計になっていないか
- [ ] 同じ導線を持つ **すべての表示面**（app / VS Code webview / 静的 SVG）を列挙し、
      それぞれで修飾・引用符付きの id を通す fence があるか。素の id だけの fixture では
      空間の一致が偶然かどうかを判別できない

## 既知の対処パターン

- **突き合わせ用の id を要素に載せる**: `DeployContainer.nodeId`（ADR-2714 で core に
  導入）を deploy コンテナの `<g>` に `data-realized-node-id` として出し、両方向とも
  ノードの bare id で手渡す（#2818 の設計、
  `docs/design/cross-navigation-highlight-id-space.md` → ADR 昇格予定）
- **受け手はビューごとに 1 属性を引く**: system / org は `data-node-id`、deploy は
  `data-realized-node-id`。fallback chain を持たない
- **突き合わせできない要素は、光らせない**: `nodeId` を持たないコンテナ（bare id が
  他のノードにも届く）はハイライト無しで切り替えるだけにする。間違った相手に点ける
  より点けない（ADR-2714 の D ボタンと同じ判断）

## 関連テスト

- `packages/core/src/compile/deploy-affordance-node-id.test.ts` — D ボタンがコンテナ id
  ではなく `nodeId` で点く（#2714 の AT-K / AT-L）
- `packages/core/src/renderer/deploy-renderer.test.ts` › `container ids in the SVG (#2714)`
  — identity 側の属性の fence。突き合わせ側の属性の fence は #2818 の実装 PR で隣に置く
- `packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts` › `Clicking a deploy
container switches to System with the realizes target highlighted` — 素の id の導線。
  修飾・引用符付きの id の導線は #2818 の実装 PR で足す
- `packages/app/src/components/PreviewPane.test.tsx` › `highlightedNodeId` — 受け手の
  lookup。ビューごとの属性に分ける変更も同じ describe に置く
