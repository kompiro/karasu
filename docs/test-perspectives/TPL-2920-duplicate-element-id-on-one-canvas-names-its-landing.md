---
id: TPL-2920
title: "1 つのキャンバスに同じ要素 id が 2 つ以上描かれる面では、最初の要素を返す API の着地点を決めて記録する"
status: active
date: 2026-09-27
applicable_to:
  - "同じ `data-node-id`（または同種の要素 id 属性）が 1 つの SVG / DOM に複数回現れうる描画面を作る・触るとき"
  - "`querySelector` / `getElementById` / Playwright の locator など『最初の 1 要素』を返す API で要素 id から要素を引く消費側"
  - "要素 id から別の表（`nodePathIndex` / `nodeMetadata`）を引いてドリル先やリンク先を決める消費側"
known_consumers:
  - preview-pane-highlight
  - outline-select
  - drill-down-svg-child-links
  - playwright-node-locators
discovered_from:
  - root_cause_adr: "ADR-2818"
  - root_cause_file: "docs/spec/permalink.md"
  - issue: "#2917"
related_to:
  - TPL-1352
  - TPL-1583
  - TPL-2818
topic: navigation
scope:
  packages:
    - core
    - app
    - e2e
---

# TPL-2920: 1 つのキャンバスに同じ要素 id が 2 つ以上描かれる面では、最初の要素を返す API の着地点を決めて記録する

## 観点

要素 id（`data-node-id`）は author-given な id で、permalink の `<id>` も同じ値を使う
（`docs/spec/permalink.md`）。single-system の各レベルでは同一親内の重複が parser エラーなので
id は 1 要素に決まるが、**複数 system のルートビュー**は 2 つの system が同じ bare id の
service を持てる（`node-id-multiple-locations` は warning）。モデルの上では同じ id の
ノードが 1 つのキャンバスに 2 つ属する。描画側がそれを両方描くと（#2917 の修正後。修正前は
bare id の key で片方が上書きされ、1 つしか描かれない）、同じ `data-node-id` の要素が 2 つ
並ぶ。

このとき「id → 要素」を引く消費側は複数の系統に分かれ、着地点がそれぞれ別に決まる:

- **最初の要素を返す API**（`querySelector`、Playwright の non-strict locator）: DOM 順で最初、つまり**先に配置された system** の要素
- **1:1 の index**（SPA の `nodePathIndex` → `nodeMetadata.viewPath`、hash の解決）:
  `@migration_target` 優先・同点は宣言順の**勝者**（TPL-1583）
- **静的 SVG のドリル**（`childLevelLinks` は `nodePathIndex` を参照しない）: 同名のカードは
  すべて同じ anchor `#krs-system-<id>` にリンクし、CSS `:target` は同じ id を持つレベルのうち
  DOM 順で最初のものを表示する。そのレベルの内容も `resolveContainerChain` が**最初の所有
  system** に解決する（#2933）。後の system が `@migration_target` を持つと SPA とは別の
  ノードに着く
- **path を持つ消費側**（`data-node-path` を読む click delegation。#2917 の設計）: 曖昧さなく
  自分のノードに着く

観点は 1 つ: **同じ id が複数要素に付く面を作るなら、その面で id から要素を引く消費側を
列挙し、それぞれがどちらの着地点を取るかを決めて記録する。** 「どれかに当たる」ままにすると、
ハイライトとドリルが別の system に着く形が黙って残る。

## 想定される失敗モード

- 描画側が Map の key を bare id にしていて、同名ノードの片方を**描かずに**消す
  （#2917: 後の system が前の system を上書きし、枠が空になる）。TPL-1352 の失敗を、
  「重複を許す面」で起こした形
- 同名ノードを両方描いたあと、ハイライト（DOM 順で最初）とドリル（index の勝者）が別の
  system に着き、どちらが正しいのかを誰も決めていない
- Playwright の strict locator（`page.locator('[data-node-id="X"]').click()`）が
  「resolved to 2 elements」で落ちる。同名 id のモデルを fixture にした spec だけが落ちる
  ので、CI では見えず、そのモデルで初めて出る
- permalink の anchor（`#krs-system-<id>`）は 1 つのレベルしか指せない（静的 SVG は CSS
  `:target` で 1 要素を選び、SPA は hash を parse して `nodePathIndex` の勝者に着地する）のに、
  描画側が同名ノードごとの anchor を期待する。permalink のテストを DOM 順の着地点で検証しない

## チェックリスト

同じ要素 id が複数要素に付きうる面を作る / 触るとき:

- [ ] その面で **id が一意でなくなる条件**（どの診断が出るモデルか）を 1 文で言えるか。
      言えないなら、まず一意であるべきかを決める（TPL-1352）
- [ ] 「最初の要素を返す」消費側（ハイライト・アウトライン・locator）と「1:1 index を
      引く」消費側（ドリル・permalink・静的リンク）を**列挙**し、それぞれの着地点を
      設計と AT に書いたか。揃えないなら、揃えない理由を書く
- [ ] 描画側の Map の key は、重複を許す次元（system）を含んでいるか。要素 id は key と
      別に、消費側が読む id 空間のまま出しているか（TPL-2818）
- [ ] 同名 id のモデルを fixture にするテストは、locator を `first()` / `nth()` /
      枠の矩形で**着地点を明示**しているか。strict モードに任せていないか
- [ ] 同名 id が描かれる面の contract test は「両方描かれる」と「着地点」の両方を
      見ているか。片方だけだと、もう片方の退行が黙って通る

## 既知の対処パターン

- **重複を許す面では Map の key を scope し、要素 id は bare のまま出す**（#2917 の設計、
  `docs/design/multi-system-root-same-id-nodes.md` → ADR 昇格予定）。ADR-1884 が同じ
  関数の collapse stub に引いた線
- **1 ノードを指したい消費側には id ではなく path を手渡す**（`data-node-path`、
  `nodePathRefId` 形。#2917 の設計はドリルと詳細パネルをこれで引く）。bare id は集合を指す
  （ADR-2088）と読めば、同一 canvas の `data-node-id` の重複は矛盾ではなく、1 ノードを指す
  属性が別に要るという意味になる。残りの hand-over（ハイライト・アウトライン・エディタへ
  ジャンプ・ADR-2818 A-2）は #2935
- **path を持てない消費側の着地点は仕様として AT に書く**: SPA の permalink と hash は
  `nodePathIndex` の勝者、ハイライトとアウトラインは DOM 順で最初。`node-id-multiple-locations`
  が作者にその状態を伝える。静的 SVG のドリルが最初の所有 system に解決する既存の食い違いは
  #2933

## 関連テスト

- `packages/core/src/parser/node-path-index.test.ts`: `node-id-multiple-locations` と
  `nodePathIndex` の勝者規則（TPL-1583）
- `packages/app/src/components/PreviewPane.test.tsx` › `highlightedNodeId`: 1 属性で引く
  ハイライト（ADR-2818）。同名 id が 2 要素あるときの着地点の fence は #2917 の実装 PR で
  隣に置く
- #2917 の実装 PR で足す core の fence（両方描かれる / 枠の中 / edge の始点 / 束ねと側面配置）
