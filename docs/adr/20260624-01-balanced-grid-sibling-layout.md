---
id: ADR-20260624-01
title: 多すぎる兄弟ノードをバランス grid で畳む
status: accepted
date: 2026-06-24
topic: renderer
related_to: [ADR-20260623-06, ADR-20260429-02]
assumptions:
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: gridColumnCount"
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: wrapLayerIntoRows"
  - "symbol: packages/core/src/renderer/layout.ts :: layout"
  - "grep: packages/core/src/style/property-schema.ts :: grid-columns"
  - "file: docs/spec/style.md"
---

# ADR-20260624-01: 多すぎる兄弟ノードをバランス grid で畳む

- **日付**: 2026-06-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1737](https://github.com/kompiro/karasu/issues/1737)（ドメイン / ユースケースの span of control が制御できない）
  - 実装 PR [#1748](https://github.com/kompiro/karasu/pull/1748)、概念 PR [#1744](https://github.com/kompiro/karasu/pull/1744)
  - 関連: [ADR-20260623-06](./20260623-06-system-view-infra-external-tier-split.md)（system view の横幅爆発を dep ティア分割で抑える別アプローチ）, [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md)
  - TPL: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（一度に見せる範囲の限定 + 単一ビューの解像度）, [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列関数のパリティ）
  - AT: [AT-1737](../acceptance/1737-balanced-grid-sibling-layout.md)、[AT-0049](../acceptance/0049-deploy-layer-wrap.md)（deploy のグリッド挙動に更新）
  - コンセプト: `docs/concepts.md`(+`.ja.md`) scoped glance 節（解像度の軸を #1744 で明文化）
  - コード: `packages/core/src/renderer/layer-layout-logics.ts`, `layout.ts`, `deploy-layout.ts`, `org-tree-renderer.ts`

## 背景

コンテナが直接子を多数持つ（span of control が大きい）とき、子ノードが横一列に潰れて並び読めなくなる症状が観測された（system frame `Hato API` 直下の usecase / domain 約 10 個）。view 全体を画面に収める zoom-to-fit で各ボックスが小さく潰れ、karasu 自身のコア原則「一度に見せる量を限定する / scoped glance」を内側から崩す。

根本原因は、レイアウトに **2 つの経路**があり折り返すのは片方だけだったこと:

- メイン `layout()`（単一 system + 全 drill-down view）は折り返し判定を持たず、1 レイヤーが無制限に 1 行へ伸びる。
- `layoutMultipleSystems`（複数 system root view）と `deploy-layout` のみ `MAX_LAYER_WIDTH` 幅基準で sub-row 折り返ししていた。

つまり症状の出る経路に折り返しが無く、しかも幅基準は「細い兄弟が多数」のケースを救えない（合計幅が閾値未満だと 1 行のまま潰れる）。この「片方の経路だけ拡張されて drift」は [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) のパリティ崩れに該当する。

なお scoped glance はこれまで「何階層降りるか（ナビゲーション）」の話に閉じていたため、#1744 で `docs/concepts.md` に「単一ビューの解像度・視覚的密度」という第二の軸を明文化し、本決定の概念的裏付けとした。

## 決定

兄弟ノードを **数を意識したバランス grid** に畳むことをレイアウトの既定とし、`.krs.style` の `grid-columns: N` で列数を上書きできるようにする。診断（「直せ」と促す警告）は起こさない（karasu は visualizes, does not prescribe）。

- **列数の既定** = `gridColumnCount(n)`: `n ≤ 5` は 1 行（`n` 列）、`n > 5` は `ceil(sqrt(n))` 列・最大 5 列（7±2 由来のキャップ）。決定的（幅・乱数に依存しない）。
- **折り返し** = `wrapLayerIntoRows`: 列数 or `MAX_LAYER_WIDTH` のどちらか早い方で row-major・宣言順に折り返す。`MAX_LAYER_WIDTH` は上限の安全弁として残す。
- **適用範囲**: 単一 system / 複数 system / deploy / org member grid の全兄弟配置経路。列数規則 `gridColumnCount` を共有し（org は既に bounded なため既定 3 を保つ `memberCols`）、行配置はメイン経路が共有 `wrapLayerIntoRows` を用い、複数 system / deploy は各々の座標系に合わせ同じ折り返し規則をインライン適用する。
- **著者上書き** `grid-columns: N`（正の整数）はコンテナノードに付け、その直接の子の列数を上書きする（system→services / service→domains / domain→usecases / team→members）。`column`（system view 限定）と異なり drill-down・org でも有効。不正値は `style-grid-columns-invalid-value` 警告を出して破棄し自動バランスにフォールバック。deploy は `realizes` でグループ化しコンテナノードが無いため auto のみ（上書き非対応）。

## 理由

- **症状の本質は「兄弟の数」**であり、幅基準では細い兄弟多数のケースを救えない。数基準のバランス grid が直接の解になる。
- **既定で読める**ことが scoped glance の責務。著者設定を前提にする案は大多数のユーザーを救わない。
- **決定性を死守**: `ceil(sqrt(n))`・row-major・宣言順はすべて決定的で、「同じ入力 → 同じ SVG」「ローカルな diff」という karasu の基盤特性（`docs/concepts.md` Goals）を壊さない。
- **`n ≤ cap` は 1 行のまま**にすることで、少数兄弟の不要な折り返しと既存スナップショットの churn を避けつつ、設計時の例（9→3×3, 10→4×3）と一致させた。
- **列数規則を共有**することで 2 経路のパリティ崩れ（本件の根本原因）を構造的に防ぐ。

### Non-goal「自動レイアウト最適化はしない」との線引き

`docs/concepts.md` Non-goals の「No fully-automatic layout optimization」（escape hatch は draw.io export）には**抵触しない**と判断する。当該 non-goal が禁じるのは「見た目を pixel-perfect にいい感じへ自動調整するエンジン」であって、本決定は **兄弟を決定的に格子へ畳む既定レイアウト規則**である。出力は決定的で、著者は `grid-columns` と draw.io export の両方で最終制御を保持する。

## 却下した案

- **幅基準の折り返しをメイン経路にも移植するだけ**（数を見ない）: 細い兄弟が多数のとき 1 行に潰れたままで、今回の症状（`Hato API`）を解決しない。
- **`grid-columns` 明示時のみ折り返し（自動既定なし）**: 後方互換は最大だが、無設定の大多数を救えず scoped glance を著者の手作業に丸投げすることになる。
- **span of control 過多を知らせる info 診断**: レイアウトで救う方針のため v1 では起こさない。レイアウト改善後になお「気づき」を出す価値があるかは follow-up で再評価する。
- **org member grid の既定も auto-balance 化**: member grid は既に `MEMBERS_PER_ROW`（3）で bounded であり「横一列に潰れる」症状が構造的に起きない。既定 3 を保ち `grid-columns` 上書きのみ対応とすることで無意味なスナップショット churn を避けた。
