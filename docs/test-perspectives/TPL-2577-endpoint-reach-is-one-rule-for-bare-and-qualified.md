---
id: TPL-2577
title: "参照の到達範囲は綴りではなく構造で決まる — bare と qualified に別々の規則を持たない"
status: active
date: 2026-08-29
applicable_to:
  - "参照サイトにスコープ規則（どこまで指せるか）を実装・変更するとき"
  - "既存サイトが受理する記法を広げるとき（セグメント数の上限解除など）"
  - "「dot が付いていれば検査しない」形のガードを書く・見つけたとき"
known_consumers:
  - edge-endpoint
  - contains
  - import-path
discovered_from:
  - root_cause_adr: "ADR-2075"
  - root_cause_file: "packages/core/src/resolver/warnings.ts"
related_to:
  - TPL-2088
  - TPL-1503
  - TPL-2075
  - TPL-2184
topic: resolver
scope:
  packages:
    - core
---

# TPL-2577: 参照の到達範囲は綴りではなく構造で決まる — bare と qualified に別々の規則を持たない

## 観点

判定は 1 つ — **その参照がどこまで届くかを、綴りを見ずに 1 文で言えるか。**

参照サイトが bare id と dotted path の両方を受理するようになると、スコープ検査に
`if (ref.includes(".")) continue;` を置く誘惑が生まれる。既存の検査を壊さずに新記法を
通せるので、差分としては最小に見える。しかしこれは**規則を 2 本にする**ことで、
「この参照はどこを指せるか」に綴りごとの答えを持たせてしまう。

- **到達範囲は構造で決める**。qualified は「スコープ外を指す許可」ではなく
  「**root を名指してそこから降りる**」と定義する。edge endpoint では
  「トップレベル root を起点に anchor されていること」がそれで、既存の 2 セグメント
  cross-system 記法（ADR-104）を深さ方向へ一般化しただけであり、新しい可視性語彙を
  発明していない
- **綴り基準の skip を残さない**。`includes(".")` で検査を飛ばすガードは、
  受理形が広がった瞬間に「検査されない領域」に変わる
- **記法を広げるなら解決も同時に広げる**（TPL-1503）。受理だけ先に出すと、
  parse は通るがどのビューにも出ない形が生まれる
- **解決の範囲は描画の範囲を超えない**。「解決できる」と「描ける」がずれると、
  in-scope と判定された参照がどのビューにも載らない（TPL-2075）。検査側と描画側は
  同じ判定関数を引く

「dotted は別の診断が持っているから」は理由になりうるが、**その別の診断が本当に
同じ範囲を覆っているか**を確認してから言う。edge endpoint の skip-if-dotted は
`cross-system-ref-*` が持っている前提だったが、後者は先頭セグメントがトップレベル
`system` の場合しか見ていなかった。

## 想定される失敗モード

- **検査の穴** — 綴りで skip したサイトが、受理形の拡大後に無検査領域になる。
  `A -> Deep.Path.Nowhere` が parse も解決もされずに黙って落ちる
- **到達範囲が説明できない** — 「bare は隣、dotted はどこでも」は、モデルが育つほど
  どちらを書くべきか判断できなくなる。ADR-2184 が畳んだ「同じ状態は同じ診断」が
  記法の軸で割り直される
- **上限の消失** — 接尾辞規則を無条件に入れると、別 system の内部構造へ直接エッジを
  張れてしまう。今日の 2 セグメント上限は偶然ではなく、ADR-104 の cross-system 記法が
  引いた構造上の上限である
- **解決と描画の乖離** — 検査側だけを広げると、描画側は旧い前提のまま残る。
  #2577 のレビューでは、宣言元 system の内部に解決する参照が「宣言元 system 自身の
  ghost フレーム」を作り、エッジの端点キーがどこにも一致しないまま黙って落ちた。
  検査が通っているぶん、silent drop より発見が遅れる

## 検証の型

規則が 1 本であることは、**綴りの違う 2 つの参照に同じ判定式を通して**確かめる:

1. 既存コーパス（`examples/**/*.krs`）で**新診断が 0 件**であること — 記法を広げた
   変更が既存モデルの判定を動かしていないことの実測。宣言ではなく計測で示す
2. 到達できる形（`Portal.Web -> Shop.Checkout.Payment`）が解決し、**描画される**こと
3. 到達できない形（anchor されていない `Checkout.Payment`）が、無検査で通るのでも
   「見つからない」でもなく、**書き直しを促す診断**になること。あわせて
   **中途半端な描画が残らない**こと（ghost フレームもノードも作られない）
4. 判定が宣言順に依存しないこと

`packages/core/src/resolver/edge-endpoint.test.ts` は 2〜4 を、
`packages/core/src/examples.test.ts` は 1 を担当する。

## 派生元 spec

- [`docs/spec/syntax.md` § Endpoint scope](../spec/syntax.md#endpoint-scope) —
  `peers(C)` の定義と、bare（peer）/ qualified（root anchor）の到達条件
- [`docs/spec/syntax.md` § Node reference path notation](../spec/syntax.md#node-reference-path-notation) —
  記法と接尾辞規則（サイト固有のスコープ規則はここでは決めない、という切り分け）
