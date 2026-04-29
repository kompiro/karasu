---
id: ADR-20260429-04
title: "`.krs.style` 側の `column` で layer 内 x 配置を上書きする escape hatch"
status: accepted
date: 2026-04-29
topic: styling
related_to: [ADR-20260429-01, ADR-20260429-02, ADR-20260411-01]
assumptions:
  - "file: packages/core/src/types/style.ts"
  - "file: packages/core/src/resolver/style-resolver.ts"
  - "file: packages/core/src/renderer/layer-layout-logics.ts"
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: bucketByColumn"
  - "symbol: packages/core/src/types/style.ts :: ResolvedLayoutHints"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: styles.layoutHints"
---

# ADR-20260429-04: `.krs.style` 側の `column` で layer 内 x 配置を上書きする escape hatch

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#969](https://github.com/kompiro/karasu/issues/969)（親 [#966](https://github.com/kompiro/karasu/issues/966)）
  - 実装 PR [#1010](https://github.com/kompiro/karasu/pull/1010)
  - 兄弟 ADR:
    - [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)（B — skip-layer エッジルーティング）
    - [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md)（D — infra/external row 引き上げ）
  - 関連 ADR: [ADR-20260411-01](./20260411-01-arch-layout-barycenter-wrap-scope-reduction.md)（layer 内 x 順序ヒューリスティクス）
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

A（actor row 再配置 [#967](https://github.com/kompiro/karasu/issues/967)）・
B Phase 2（skip-layer 直交ルーティング [ADR-20260429-01](./20260429-01-orthogonal-edge-routing-skip-layer.md)）・
B Phase 3（port distribution + channel lane allocation [#996](https://github.com/kompiro/karasu/issues/996)）・
D（infra/external 引き上げ [ADR-20260429-02](./20260429-02-infra-row-by-deepest-consumer.md)）が
すべて main に着地した時点で、karasu の auto-layout は EC Platform 例の
主要な崩れを自動で解消できる。これらは **トポロジ起点**で動く以上、原理的に
以下が残る:

- **作者が意図する x 位置**を auto-layout は推論できない（例: 監査用 `Admin`
  を右端に固定したい、外部 SaaS だけ右側に集めたい）。
- A/B 後に同 row へ並んだ複数ノードの **x 順序**は barycenter 任せ。Phase 3 は
  edge 端点とラベル位置の分散であって、ノード x 位置の制御ではない。

実例として `examples/getting-started{,-en}/` の最下段は、infra
（EC Site DB / Order events / Media storage）と external service
（Payment / Inventory）と internal service（Notification）が barycenter で
混在する状態になっており、種別ごとに揃えたい意図はトポロジに現れない。

## 決定

`.krs.style` に **`column: left | center | right`** プロパティを追加する。
system view の同じ layer 内で、左 / 未指定or`center` / 右 の 3 バケットに
振り分け、各バケット内では既存の並び（system view では宣言順、それ以外では
barycenter）を保持する。

```css
service[external] { column: right; }
queue, database, storage { column: center; }
/* internal service は未指定 → 中央バケットに入る */
```

実装は以下の構成:

- `ResolvedStyles` に `layoutHints: Map<nodeId, ResolvedLayoutHints>` を追加し、
  描画属性（`ResolvedNodeStyle`）と分けて持つ。
- `style-resolver` が `ResolvedNodeStyle` と layout hints を **同一 cascade**
  から導出する（merged props を共有）。invalid 値は
  `style-column-invalid-value` 警告を出して破棄、deploy / org node 上で
  resolve した column は `style-column-ignored-non-system-view` 警告で無視
  する。
- 新規 `bucketByColumn` を `layer-layout-logics.ts` に追加し、
  `layout()` の system view パスで barycenter / 宣言順の **前段**に挟む。
- B の orthogonal routing は `bucketByColumn` 後の座標を入力に再計算するので
  追加の連動コードは不要。

副次的に、`layout.ts` 単一 system パスで `y = layerIdx * dims.height` と
ノード固有高さに依存していたバグも修正（per-layer baseline y）。column hint
で再配置されたときに高さの違うノード間で y がズレる症状を解消する。

## 理由

- **モデルを汚さない**: `.krs` は「実際の構造」、`.krs.style` は「見せ方」
  という分離が貫ける。escape hatch をモデルに置くと、後で「なぜ Admin に
  `[right]` タグが付いているのか」と誤読される。
- **既存 cascade を流用**: 同じ selector / specificity / 後勝ちルール。
  実装は新プロパティの追加と layout への小さなフックのみ。
- **B と非干渉**: `column` は layer 内 x 順序にだけ作用する。B の waypoint
  計算ロジックに手を入れず、新座標で自然に再ルーティングされる。
- **段階的拡張**: `column` 単独で開始。`rank` / `column-span` / `row` は
  motivating example が出てから個別検討する。空振り設計を避ける。

## 却下した案

### C1: モデル側にレイアウト用タグ（例: `[lane:right]`）を追加
- `.krs` に `[lane:right]` のようなタグを書けるようにする案。
- 却下理由: タグは「この要素が何者か」を表す語彙。レイアウト都合をタグに
  混ぜると、モデルの意味が見せ方に汚染される。

### C2: 名前空間付きプロパティ（`layout-column:`, `karasu-layout: ...`）
- CSS の `-webkit-` のようにベンダープレフィックスでレイアウト系を分ける。
- 却下理由: karasu の `.krs.style` は CSS 風だが CSS そのものではない
  （`shape:` 等、独自プロパティが既にある）。プレフィックスを足すと既存
  プロパティとの一貫性が崩れる。

### C3: 数値座標 `x: 320px;` `y: 80px;`
- 完全フリーフォームで絶対座標を指定できるようにする。
- 却下理由: escape hatch の用途を超える。図のサイズ・フォント・テーマで
  座標は容易にズレるため、保守不能になる。`column` のような **意図** ベース
  に絞る。

### C4: 別ファイル `*.krs.layout` を新設
- レイアウトヒントは独立ファイルに切り出す。
- 却下理由: ファイルが増える割に得るものが少ない。`.krs.style` で
  selector を共有できる方がはるかに便利。

### C5: `flex` / `grid` 風のフルレイアウト DSL
- `display: grid; grid-template-rows: ...` のような完全な DSL を導入。
- 却下理由: スコープ過剰。auto-layout が主役で、hint は最後の調整という
  本 Issue の前提（"keep it minimal"）から逸脱する。

### C6: Issue 本文の strawman どおり `lane:` を採用
- 却下理由: B のフォローアップ Phase 3 が edge routing の **per-channel
  lane allocation**（チャネル内ラベル y 分散）という内部概念で「lane」を
  使う。同じ機能領域で「lane」が node x 配置と edge label y 分散の両方を
  指すと、ドキュメントとコードの両方で曖昧になる。`column` は「同 row 内の
  どの列か」を素直に表し、CSS の `flex`/`grid` 系慣習にも近い。

### C7: `rank` / `row` も同時に導入する
- `rank: 3` で layer 自体を動かせる API を最初から提供する案。
- 却下理由: layer は kind とエッジから決まるという A の不変条件が崩れる。
  row を動かしたい不満は実態として x 並びの不満であり、`column` で吸収できる
  ことが多い。本当に layer を変える必要が出たら A のヒューリスティクス側で
  対処する Issue を立てるべき。

## スコープ外（フォローアップ）

- **deploy / org view 用 hint**: 配置ロジックが根本的に異なるため、`column`
  は system view のみ。将来 deploy / org に hint を入れたくなった場合は別
  プロパティ名（例: deploy 向け `tier:`）で個別設計する。
- **`karasu render` の all-views CLI パス**: `buildAllViewsSvgProject` が
  `@import` で解決された style sheet を消費しない pre-existing 制約があり、
  CLI から `--view system` を指定しないと `column` の効果が出ない。実例で
  困る声が出たら別 Issue 化する。
- **snapshot diff 観点**: `column` を含まない既存ファイルの SVG 出力は
  完全互換。getting-started の `.krs.style` には初期値として
  `service[external] { column: right; }` が入っており、これが唯一の SVG
  形状変化。
