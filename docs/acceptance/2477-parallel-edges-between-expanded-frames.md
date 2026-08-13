# AT: 展開済み service 間の並列エッジが重ならない

- **日付**: 2026-08-13
- **関連 Issue**: [#2477](https://github.com/kompiro/karasu/issues/2477)
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-bundles.ts`
  - `packages/core/src/renderer/layout.ts`（呼び出し箇所のコメント）
- **関連 AT**: [AT-1185](./1185-parallel-edge-bundling.md)（並列エッジ束ねの本体）, [AT-1921](./1921-single-container-in-frame.md)（in-place 展開）, [AT-1955](./1955-expand-all-services.md)（全 service 展開）
- **関連 TPL**: [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)

## 受け入れ条件

- [x] 両端が in-place 展開された service の並列エッジ（`S1 -> S2` と `S1 --> S2`）が別々の座標に描かれる。束としての identity（`bundleSize = 2`）と frame 辺上のアンカー（両者の y が一致）は保たれる
  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `keeps parallel edges between two expanded frames apart (#2477)`

- [x] 同じモデルを展開せずに描いた場合、port は従来どおり `distributePorts` が `i/(N+1)` に分散し、束ねパスは触らない（gate 一般化の回帰柵）
  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `leaves parallel edges between collapsed services to distributePorts`

- [x] 束ねパス単体で、port が分散されていない通常エッジの束が perpendicular に分離される（`BUNDLE_GAP` = 12px、対称オフセット）
  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › `nudges a regular bundle whose ports were never distributed (#2477)`

- [x] 重なったエッジが waypoint を持つ場合、polyline 全体が平行移動する（端点だけずれて経路が kink にならない）
  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › `moves a co-located routed edge's waypoints with its ports`

- [x] 分散済みのエッジは動かない。束の一部だけが重なっている場合、重なっていないエッジはその場に留まる。端点が同じでも経路が違うエッジは重なりとみなさない
  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › `does not move ports that distributePorts already spread` / `leaves an edge alone when only its siblings are stacked` / `treats edges with the same ports but different routes as separated`

- [x] ghost / cyclic エッジの nudge は従来どおり（ゼロ長の NaN 回避を含む）
  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › `nudges ghost edges perpendicular to the edge direction` / `nudges cyclic edges perpendicular as well` / `handles N=3 with symmetric offsets` / `does not nudge zero-length ghost edges (avoids NaN)`

- [ ] app 上で 2 つの service を展開した状態で、同期矢印（実線）と非同期矢印（破線）が 2 本とも見える
  > 🧑 Manual — 下記「手動検証の入力」を参照。

## 手動検証の入力

本番 app（https://karasu.kompiro.dev/）で下記を `index.krs` として開き、`S1` と `S2` をそれぞれカードの展開アフォーダンスで in-place 展開する。

```krs
system T {
  service S1 { domain A { usecase u } }
  service S2 { domain B { usecase v } }
  S1 -> S2
  S1 --> S2
}
```

展開後、`S1` の frame から `S2` の frame へ **実線と破線の 2 本**が並んで描かれること（修正前は破線 1 本しか見えない）。

## 補足

- 根因は gate の書き方。`markParallelBundles` は「port が分散されていないエッジ」を nudge するつもりで `edge.ghost || edge.cyclic` と書いていた。ADR-1185 の時点ではそれが `distributePorts` の skip 条件と一致していたが、in-place 展開（ADR-1815 / ADR-1955）が 3 つ目の skip 経路 — 端点が `layoutNodes` に無い frame アンカー — を足したため、カテゴリ列挙が事実から乖離した。
- 修正は列挙を増やさず、判定を事実（束の中で polyline が一致しているか）に置き換えた。決定は [ADR-2477](../adr/2477-parallel-edge-nudge-gate-colocation.md)。
