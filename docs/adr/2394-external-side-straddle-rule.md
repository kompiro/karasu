---
id: ADR-2394
title: external のサイド振り分けは「跨いでいるか」で 2 つの regime に分ける
status: accepted
date: 2026-08-16
topic: renderer
refines: [ADR-1728]
related_to: [ADR-969, ADR-1724]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/layout.ts :: placeExternalServicesOnSides"
  - "grep: packages/core/src/renderer/layout.ts :: straddlesCentre"
  - "grep: packages/core/src/renderer/layout.ts :: groupSide"
---

# ADR-2394: external のサイド振り分けは「跨いでいるか」で 2 つの regime に分ける

- **日付**: 2026-08-16
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2394](https://github.com/kompiro/karasu/issues/2394)、実装 PR [#2507](https://github.com/kompiro/karasu/pull/2507)
  - refines: [ADR-1728](./1728-external-on-sides-layout.md)（サイド配置と median 分割）
  - 前段の修正: [#2384](https://github.com/kompiro/karasu/issues/2384)（退化した median のフォールバック）
  - TPL: [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)（観点 8 を本 ADR で改訂）
  - AT: [AT-2394](../acceptance/2394-external-side-straddle-rule.md)
  - コード: `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides`）

## 背景

[ADR-1728] は `[external]` を左右のサイド列に置き、どちらに置くかを **consuming-hub
barycenter の median** で分割していた。別ハブのファンを左右に分けると cross-hub 交差が
消える（`hato` で 33 → 0）ためで、これは意図どおり働く。

問題は、median が**順位ベース**の統計量であることにある。median は必ず集合の内側に落ちるので、
`<= median` は要素が実際にどこにいようと 1〜n-1 件を左に残す — つまり**分割が常に起きる**。
消費ハブが全員が図の右半分にいるモデルでも分割は実行され、最も左寄りの external が左列へ
飛ばされて、その 1 本のエッジが図を横断していた（#2394）。

[#2384] が塞いだのは、この構造の**退化ケース**（重心が全部同値で median が各要素と一致する）
だけだった。「spread はあるが全員が片側」という帯は残っていた。

## 決定

サイド振り分けを 2 つの regime に分け、判定は **消費ハブの重心が content centre を跨ぐか**
の 1 点で行う。

| regime | 条件 | 振り分け |
| --- | --- | --- |
| 分離 | 重心が content centre を跨ぐ | 従来どおり median で分割（[ADR-1728] の意図） |
| 非分離 | 跨がない（全員が片側 / 全員が中心上 / 退化） | 自動割り当て分を**まとめて**ハブのある側へ |

- 非分離側は **グループ単位で割り当てる**。「centre を閾値にして各要素を比較する」形では書かない
  — ちょうど centre に載った重心が `<=` で反対側に落ち、同じ stranding が 1 段下で再発する
  （#2507 のレビューで検出。右寄りの集合の最寄りハブが centre と一致して、その external だけが
  左列に取り残された）。
- 跨ぎ判定は `SIDE_SPLIT_EPSILON` 付きで行う。重心はノード中心の平均なので、数学的に等しい値が
  加算順で最下位ビットだけ違うことがある。この epsilon により **spread の無い集合は跨げない**
  ので、#2384 が置いた `noSpread` の独立したガードは本 ADR で削除した（同じ判定の極限として
  吸収される）。
- 重心が全部 content centre に一致する場合（ハブが 1 つ、図の中央）は左に寄る。`hato` が
  この形で、従来と同じ配置を保つ。

## 理由

実モデルと、median と centre が食い違う合成モデルで計測した（交差 = 別エッジ同士の狭義内部交差、
長さ = side 配置 external に接続するエッジの総長）。

| モデル | median（従来） | 採用案 | centre 常用（却下） |
| --- | --- | --- | --- |
| #2394 の repro | 0 / **640** | 0 / **421** | 0 / 421 |
| ハブが左右に散る | 0 / 200 | 0 / 200 | 0 / 200 |
| disagree A + infra | 2 / 1323 | 2 / 1323 | **1** / 1126 |
| disagree B + infra | **1** / 1064 | **1** / 1064 | 2 / 778 |
| `examples/en/hato` | 4 / 4339 | 4 / 4339 | 4 / 4339 |

- **[ADR-1728] が固定した図が動かない**。`hato` と既存 examples は 3 案とも同値で、交差削減の
  成果は据え置きのまま症状だけ消える。
- **跨ぐモデルの挙動が 1 つも変わらない**。分離が要る入力では従来の median 分割がそのまま走るので、
  cross-hub 交差の退行が構造的に起こらない。
- **判定基準が集合の外から来る**。content centre は配置の文脈から決まる座標で、決定的
  （[ADR-1728] の要件）。順位ベースの閾値と違い「分けない」という答えを返せる。
- **#2384 の退化ケースが特別扱いでなくなる**。「跨がない」の極限として同じ分岐に乗るため、
  規則が 1 つ減る。

## 却下した案

### 常に content centre と比較する（median を捨てる）

規則は 1 つに畳めるが、跨ぐモデルの挙動を交差と長さのトレードで書き換える。上表のとおり
disagree A では交差 2 → 1 と改善する一方、disagree B では 1 → 2 に増える（長さは −27%）。
合計では交差同数・長さは短いが、**交差を支配項とした [ADR-1728] の優先順位を覆す**ことになる。
覆すだけの証拠が無い — 実モデル（`hato`・examples）では 3 案とも同値で、差が出るのは合成モデル
だけだった。総エッジ長を第一目的に置き直すなら、その判断は別途 ADR で行う。

### 非分離側も閾値比較で書く（各 external を centre と比較）

#2507 の初版がこれで、レビューで却下した。ちょうど centre に載った重心が `<=` で左へ落ち、
片側に寄せたい集合から 1 件だけ切り離される。**「分けない」と決めた regime に閾値を持ち込むと、
閾値がある限り分割の可能性が残る**。

### 近接優先（跨ぎ判定なしで常にハブ側へ）

「各 external を自分のハブの側へ」を無条件に適用すると、2 つのハブが中心付近で近接する図で
ファンが混ざり cross-hub 交差が戻る。[ADR-1728] の PoC で機械的な半々割り当てが 14 交差だった
のと同じ理由で、跨いでいるときは分離が要る。

## 影響

- 変わるのは「消費ハブが全員片側」のモデルだけ。`examples/` の図は再生成不要（計測で同値を確認）。
- [TPL-1761] 観点 8 を「順位ベースの閾値は必ず分割する — 分割してよい入力かを集合の外から判定する」
  に一般化し、検証を 4 通り（跨ぐ / 片側 / 境界一致 / 退化）に拡張した。
- `column: left/right`（[ADR-969]）の override 優先、≥2 ハブ gate、infra kind の境界ルールは不変。
