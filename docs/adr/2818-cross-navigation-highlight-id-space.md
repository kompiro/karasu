---
id: ADR-2818
title: クロスナビゲーションのハイライトは、手渡す側が名指した 1 つの属性でノード id を突き合わせる
status: accepted
date: 2026-09-27
topic: navigation
authors: [kompiro]
depends_on:
  - ADR-2714
related_to:
  - ADR-422
  - ADR-425
  - ADR-2088
  - ADR-2917
scope:
  packages: [core, app, vscode]
assumptions:
  - "symbol: packages/core/src/renderer/layout-types.ts :: realizedNodeId"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: data-realized-node-id"
  - "grep: packages/core/src/renderer/deploy-layout.ts :: realizedNodeId: c\\.nodeId"
  - "symbol: packages/app/src/state/app-reducer.ts :: HighlightAttribute"
  - "grep: packages/app/src/state/app-reducer.ts :: highlightAttribute: action\\.highlightAttribute \\?\\? \"data-node-id\""
  - "symbol: packages/app/src/hooks/useHistoryNavigation.ts :: hashHighlightAttribute"
  - "grep: packages/app/src/components/PreviewPane.tsx :: data-realized-node-id"
  - "grep: packages/vscode/src/preview-panel.ts :: data-realized-node-id"
  - "grep: packages/vscode/src/webview-content.ts :: msg\\.attribute"
  - "file: docs/acceptance/2818-cross-navigation-highlight-id-space.md"
  - "file: docs/test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md"
---

# ADR-2818: クロスナビゲーションのハイライトは、手渡す側が名指した 1 つの属性でノード id を突き合わせる

- **日付**: 2026-09-27
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2818](https://github.com/kompiro/karasu/issues/2818)（[#2714](https://github.com/kompiro/karasu/issues/2714) の PR #2796 から切り出した残課題。同じ穴は [#2549](https://github.com/kompiro/karasu/issues/2549) の修飾 id 以来ある）
  - PR: [#2903](https://github.com/kompiro/karasu/pull/2903)（Design Doc）, [#2918](https://github.com/kompiro/karasu/pull/2918)（実装）
  - 後続 Issue: [#2917](https://github.com/kompiro/karasu/issues/2917)（複数 system のルートビューで同名ノードが 1 つに潰れる）
  - 前提 ADR: [ADR-2714](2714-deploy-container-id-injective.md)（コンテナの identity とノードとの突き合わせを別の id で持つ。本 ADR はその線を SVG・app・VS Code まで延長する）
  - 関連 ADR: [ADR-422](422-atomic-highlight-on-cross-navigation.md)（ビュー切替とハイライトを 1 dispatch で行う）, [ADR-425](425-hash-highlight-restoration.md)（ハイライトを hash の `:<highlight>` に載せる）, [ADR-2088](2088-node-reference-path-notation.md)（slice C = #2549 で修飾コンテナ id が入った）
  - 関連 TPL: [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md)（本件で起こした）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md), [TPL-2789](../test-perspectives/TPL-2789-injected-dom-state-follows-reinjection.md)
  - AT: [AT-2818](../acceptance/2818-cross-navigation-highlight-id-space.md)

## 背景

ADR-2714 は deploy コンテナの **identity**（`serviceId`、SVG では `data-container-id`）と、
**ノードとの突き合わせ**に使う id（`DeployContainer.nodeId`）を core で分けた。identity は
`nodePathRefId` で injective に畳むので、修飾（`Shop.Api`）や引用符（`"www.example.com"`）で
ノードの id 空間に無い綴りになる。`nodeId` は D ボタンと draw.io には届いていたが、
SVG には載っておらず、app の `PreviewPane` は 1 つの文字列を 2 つの属性に順に当てていた。

```ts
querySelector(`[data-node-id="${id}"]`) ?? querySelector(`[data-container-id="${id}"]`);
```

- **deploy → system**: コンテナのクリックは `data-container-id` をそのまま渡す。system の
  ノードは bare id なので、修飾・引用符付きの id はどちらにも当たらない
- **system → deploy**: D ボタンは bare id を渡す。deploy のコンテナは identity を持つので、
  fallback も外れる

`main`（8633b017）で core を通して測った結果:

| #   | モデル                                                   | system の `data-node-id` | deploy の `data-container-id`     | `nodeId`                           |
| --- | -------------------------------------------------------- | ------------------------ | --------------------------------- | ---------------------------------- |
| 1   | `service "www.example.com"` を 1 unit が realize         | `www.example.com`        | `"www.example.com"`               | `www.example.com`                  |
| 2   | `Shop.Api` / `Admin.Api` / `Worker` を 3 unit が realize | `Api`, `Worker`          | `Shop.Api`, `Admin.Api`, `Worker` | `undefined`, `undefined`, `Worker` |
| 3   | `Shop.Api` だけ realize（`Admin.Api` は未デプロイ）      | `Api`                    | `Api`                             | `undefined`                        |

行 1 は両方向とも外れる。行 3 は綴りの偶然で光っていたが、bare id `Api` は未デプロイの
`Admin.Api` にも届くので、ADR-2714 が D ボタンに対して「点けない」と決めた形でもある。

`highlightedNodeId` に値を入れる経路は D ボタン・詳細パネル・コンテナのクリック・
チームボタン・owned service・アウトライン・hash 復元の 7 つで、コンテナのクリックだけが
ノードの id 空間に無い値を入れていた。VS Code webview も `switchViewAndHighlight` で同じ
導線を持ち、handler が `[data-node-id]` しか引かないため素の id でも光っていなかった。

### 実装中に分かったこと

Design Doc（PR #2903）は「受け手のペインがビューごとに属性を決める（deploy ペインは
`data-realized-node-id` だけを引く）」と書いた。実装 PR の `/code-review` で、deploy ビューには
**アウトライン**という別の producer がいて、それは unit の id を `data-node-id` で渡すことが
分かった。ペインで決めると同じペインに 2 つの producer がいるときどちらかが外れる。
id 空間は手渡す側の性質なので、属性は producer が id と一緒に state に載せる形に改めた。
VS Code 側は最初から message に属性を載せていたので、両者の形が揃った。

## 決定

1. **core**: `DeployContainer.nodeId` を `ContainerRect.realizedNodeId` として layout に通し、
   deploy コンテナの `<g>` に `data-realized-node-id` として出す。`nodeId` が無いコンテナ
   （修飾・絞り込み参照・synthetic）には出さない。system の expanded frame が持つ
   `ContainerRect.nodeId` とは別フィールドにする（コンテナの renderer が共有されているため）
2. **app**: `highlightAttribute`（`"data-node-id" | "data-realized-node-id"`）を `AppState` に
   `highlightedNodeId` と並べて持ち、`SET_ACTIVE_VIEW` / `SET_HIGHLIGHTED_NODE` が運ぶ。
   **手渡す側が属性を名指す**: D ボタン（詳細パネルの deploy ボタンも同じ handler）と
   deploy ビューへの hash 復元は `data-realized-node-id`、それ以外と属性を言わない action は
   `data-node-id`。`PreviewPane` は渡された 1 属性だけを引き、fallback chain を持たない
3. **app**: コンテナのクリックは `data-realized-node-id` の値（無ければ `null`）を手渡す。
   `null` のときは system に切り替えるだけでハイライトしない（ADR-2714 の D ボタンと同じ判断）
4. **VS Code**: highlight message に属性名を載せる。`switchViewAndHighlight` で deploy に入る
   ときは `data-realized-node-id`、カーソル追従は `data-node-id`。selector の id は
   `CSS.escape` する
5. hash の `:<highlight>` は ADR-425 のまま **ノード id** で、属性は載せない。deploy ビューの
   hash 復元は `data-realized-node-id` で引く

## 理由

- **ADR-2714 が core に引いた線をそのまま延長する。** 突き合わせの判断（`nodeId` を出すか）は
  引き続き core の 1 箇所で、SVG は自己記述的なまま。`PreviewPane` は DOM だけで突き合わせられ、
  モデル側の対応表を持たない
- **`highlightedNodeId` が常にノードの id になる。** hash・share payload・アウトラインなど
  既存の消費側と id 空間が揃う。修飾も引用符も持たないモデルでは
  `data-realized-node-id` と `data-container-id` が同じ綴りになるので、行 3 以外の挙動は
  変わらない
- **属性は手渡す側にしか分からない。** deploy ビューの `data-node-id` は unit の id 空間で、
  unclassified の unit は bare id を持つ（`oci Api {}` → `data-node-id="Api"`）。ペインで属性を
  決めるとアウトラインが外れ、fallback chain にすると unit がコンテナ宛のハイライトを
  横取りする。producer が名指す形だけが両方を満たす（TPL-2818）
- **`data-node-id` はコンテナに付けない。** click delegation の `closest("[data-node-id]")`、
  VS Code のカーソル追従、org の member fallthrough が「クリックできるノード」の印として
  読んでいて、付けると意味が同時に変わる
- **hash に属性を載せない**のは、`:<highlight>` を「id」と定める ADR-425 と
  `docs/spec/permalink.md` の契約を変えないため。代償として、アウトラインが deploy ビューで
  付けたハイライト（unit id）は reload / back で復元されない。影響するのは unclassified の
  unit だけで、realize された unit は `<container>::<unit>` で描かれ以前から一致していない

## 却下した案

- **app 側でコンテナ id ↔ ノード id の対応表を持つ**: 突き合わせの知識が core と app に
  分かれ、対応表と SVG の鮮度を別に管理することになる（TPL-2789 の「流し込んだ DOM と
  後から当てる状態のずれ」をもう 1 段増やす）。VS Code webview は compile 結果を持たないので
  別経路も要る
- **コンテナ要素にも `data-node-id` を付ける**: 上記のとおり消費側の意味が変わる。コンテナと
  unit が入れ子で同じ属性を持ち、`closest` の結果がクリック位置で変わる
- **コンテナ id をハイライト id のまま system 側で逆変換する**: ADR-2714 が「突き合わせ側が
  identity を読むかぎり、injective にするたびに消費側が外れる」と書いた構造をそのまま残す
- **受け手で `[data-realized-node-id] ?? [data-node-id]` の順に引く**: 今はどちらの順でも動くが、
  それは偶然の非衝突で、TPL-2818 が退ける fallback chain そのもの
- **受け手のペインがビューごとに属性を決める**（Design Doc の当初案）: アウトラインという
  第 2 の producer で外れることが実装中に分かり、producer が名指す形に改めた
- **`nodeId` の無いコンテナから所属 system へドリルダウンして bare id を光らせる**: SVG に
  path を載せる別契約が要り、D ボタン側は点かないままなので方向で非対称になる。ルートで
  同名ノードが潰れる #2917 が先。必要になれば別 Issue
- **hash に属性を載せる**（CodeRabbit の提案）: ADR-425 / `permalink.md` の grammar 変更に
  なるので本件では見送り、制限として受け入れた。必要になれば `:<highlight>` の拡張と
  `SharePayload.target` の更新を別 Issue で扱う

## 影響範囲

- 修飾も引用符も持たず絞り込み参照も無いモデル: hash・ハイライト・クリックの挙動は変わらない
- 引用符付き id のモデル: 両方向のハイライトが光るようになり、deploy → system の hash は
  identity の綴り（ブラウザでは `"` が `%22` に percent-encode される）から `:www.example.com`
  になる
- 絞り込み参照のモデル（行 3）: deploy → system のハイライトが光らなくなる（意図した変更。
  AT-J）
- VS Code: 詳細パネルの「deploy ビューを開く」で、realize したコンテナが光るようになる
- CLI `karasu render` の deploy SVG に属性が 1 つ増える。見た目は変わらない
- changeset: `@karasu-tools/core` / `karasu` / `karasu-vscode` に patch

## 残課題

- 複数 system のルートビューで同名ノード（`Shop.Api` と `Admin.Api`）が `data-node-id="Api"`
  1 つに潰れる描画（[#2917](https://github.com/kompiro/karasu/issues/2917)）。本 ADR の
  突き合わせとは独立した core の問題で、ドリルダウン案を将来やるなら先に要る
- アウトラインが deploy ビューで付けたハイライトは reload / back で復元されない（上記
  「hash に属性を載せない」の代償）
