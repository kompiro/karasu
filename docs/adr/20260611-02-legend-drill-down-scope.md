---
id: ADR-20260611-02
title: ドリルダウン深度スコープによる凡例の完全一致切り替え
status: accepted
date: 2026-06-11
topic: renderer
related_to:
  - ADR-20260428-07
  - ADR-20260429-03
scope:
  packages:
    - core
assumptions:
  - "file: docs/spec/syntax.md"
  - "file: docs/acceptance/1513-legend-drill-down-scope.md"
  - "file: examples/feature-samples/legend.krs"
  - "symbol: packages/core/src/renderer/svg-builder.ts :: legendScopeMatches"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: legendScopeForLogicalSlice"
  - "symbol: packages/core/src/renderer/all-layers-svg.ts :: buildLegendRenderOptions"
  - "grep: packages/core/src/types/ast.ts :: \"system\" \\| \"service\" \\| \"domain\" \\| \"deploy\" \\| \"org\""
---

# ADR-20260611-02: ドリルダウン深度スコープによる凡例の完全一致切り替え

- **日付**: 2026-06-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1513](https://github.com/kompiro/karasu/issues/1513)
  - 設計 PR [#1514](https://github.com/kompiro/karasu/pull/1514) / 実装 PR [#1517](https://github.com/kompiro/karasu/pull/1517)
  - ADR-20260428-07 — 図の凡例（legend）構文をモデル側に追加する
  - ADR-20260429-03 — 凡例 ref のフォールバック swatch
  - 仕様: [`docs/spec/syntax.md`](../spec/syntax.md) の View scope 節
  - AT: [`docs/acceptance/1513-legend-drill-down-scope.md`](../acceptance/1513-legend-drill-down-scope.md)
  - 関連 Issue/PR: #1495 / #1512（`legend-not-top-level` — ネスト legend は parse error）

## 背景

service / domain にドリルダウンしたとき、レベルごとに関連する凡例へ切り替えたい
（#1513）。トップレベルではサービス境界色や `[external]` の説明が重要だが、
domain レベルでは usecase→resource の `R`/`W` エッジラベルなど、深い階層で
のみ現れる語彙の説明が必要になる。

設計時のインベントリで、単一 SVG 系のレンダーパス（drill-down / all-layers /
all-views）には legend がそもそも配管されていないことが分かった
（TPL-20260510-11 の言う並列レンダーパス間 drift の実例）。

さらに実装中に設計時の現状認識の誤りが見つかった: 対話的プレビュー経路
（`compile()` + `viewPath`）は `viewScope: "system"` をハードコードしており、
**全ドリルダウン深度で省略スコープ / `legend system` の凡例が表示され続けて
いた**。「ドリルダウンに凡例は描画されていない」は単一 SVG 系パスのみの事実
だった。完全一致セマンティクスの適用はこの経路にとって挙動変更（既存ファイル
ではドリルダウン中に凡例帯が消える）になるため、実装中にあらためて確認のうえ
採用した（scoped glance 原則に沿う方向の変更）。

## 決定

legend の view-scope 語彙に論理ドリルダウン深度 `service` / `domain` を追加し、
描画レベルとスコープの**完全一致**で凡例を切り替える（深さをまたぐ重ね合わせ
なし）。あわせて全マルチレベルレンダーパスに legend オプションを配管する。

### 表示セマンティクス

| legend ヘッダ | 表示される場所 |
| --- | --- |
| （省略） | 各ビュー（system / deploy / org）のトップレベルのみ |
| `legend system` | 論理ビューのトップレベル（system 一覧）のみ |
| `legend service` | service を root にしたドリルダウンレベルのみ |
| `legend domain` | domain を root にしたドリルダウンレベルのみ |
| `legend deploy` / `legend org` | 各ビュー（深さ概念なし = ビュー全体） |

- スコープ語彙を持たないノード（system フレーム・usecase 等）を root にした
  ドリルダウンレベルには凡例を描画しない
- 同一深さ内では従来どおり、マッチした legend を宣言順に積む
- all-layers ビューはレベル帯ごとに、そのレベルのスコープの凡例を帯直下に表示
- ドリルダウンレベルの凡例は opt-in: 既存スコープ（省略 / system / deploy /
  org）のみのファイルはトップレベルより下に凡例を描画しない

### 実装の要点

- マッチングは `legendScopeMatches`（`svg-builder.ts`）に一元化
- 論理ビューの描画スコープは `legendScopeForLogicalSlice`（`svg-renderer.ts`）
  が view slice から導出（root 一覧 = `system`、drill root の kind = 深度）
- legend 配管は `buildLegendRenderOptions`（`all-layers-svg.ts`）に集約し、
  全ビルダーが spread する。新しいレンダーパスが配管を取りこぼす drift
  （TPL-20260510-11）を構造的に防ぐ

## 理由

- **scoped glance 原則（TPL-20260510-21）**: 各スコープで見せる情報量を限定
  するのが karasu の認知設計。レベルごとに関連する凡例だけを見せる完全一致は
  この原則の凡例への適用。「全レベルの凡例を常時全部出す」案は同原則に反する
  ため却下
- **文法変更が最小**: `service` / `domain` は既存キーワードで lexer 変更不要。
  scope トークン追加のみで共通ケース（「このレベルではこの凡例」）を最短で
  表現できる
- **後方互換に拡張可能**: 将来のノード指定（`legend #<id>`）は深度スコープと
  文法上衝突しないことを確認済み
- **legend のトップレベル配置は維持**: #1512 で「service ブロック内に legend
  を書く」authoring を意図的に閉じたため、レベル指定は legend ヘッダの語彙
  拡張で表現する

## 却下した案

- **案A: 深さ語彙の追加のみ（ノード指定なし・単段階）** — 採用案はこれを v1
  とする段階導入（案C）。差は将来拡張の位置付けのみ
- **案B: ノード指定 legend（`legend #OrderService "..."`）** — 表現力は最大
  だが、id 検証・import / ghost との相互作用・rename 追従など文法・解決
  コストが高く、共通ケースでも全ノード分書く authoring 負担がある。需要が
  観測されてから別 Issue で検討する
- **省略スコープの全深度継続表示** — 対話的経路の従来挙動は保存できるが、
  深度間の切り替えセマンティクスと両立せず、scoped glance 原則にも反する

## 決めないこと

- **ノード指定 legend（`legend #<id>`）**: 需要が観測されてから別 Issue で検討
- **deploy ビューの深さ語彙**: deploy ビューに階層遷移が将来できた場合に
  あらためて検討する。今回は語彙を予約しない
- **diff ビュー / org focused-team / icon-mode org 経路への凡例描画**: 従来
  どおり対象外（spec「What's not in v1」参照）
