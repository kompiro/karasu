---
type: product
---

# AT-1185: Parallel-edge bundling between the same node pair

- **日付**: 2026-05-10
- **関連 Issue**: [#1185](https://github.com/kompiro/karasu/issues/1185)（親 [#1071](https://github.com/kompiro/karasu/issues/1071)）
- **関連 Design Doc**: [docs/design/parallel-edge-bundling.md](../design/parallel-edge-bundling.md)
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-bundles.ts`、`...test.ts`
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/core/src/renderer/layout.ts`、`packages/core/src/renderer/layout.test.ts`
  - `packages/core/src/renderer/layout-types.ts`
  - `examples/feature-samples/parallel-edges.krs`

## 受け入れ条件

- [x] AT-A: `(from, to)` を共有するエッジが 2 本以上あるとき、各エッジに 0-based の `bundleIndex` と `bundleSize` (≥ 2) が付く
  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › `markParallelBundles › annotates parallel edges with bundleIndex / bundleSize in input order`

- [x] AT-B: 単一エッジ（`(from, to)` ペアに 1 本のみ）には `bundleIndex` / `bundleSize` が付かない
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › leaves single edges untouched` および `layout.test.ts` › `... > does not annotate single edges`

- [x] AT-C: sync (`->`) と async (`-->`) が同一 `(from, to)` ペアに混在する場合、kind を問わず 1 つのバンドルとして扱われる
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › treats sync and async between same pair as one bundle` および `layout.test.ts` › `... > bundles sync and async between same pair together`

- [x] AT-D: `(A, B)` と `(B, A)` は別グループとして扱われ、互いに bundle を作らない
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › treats \`(A,B)\` and \`(B,A)\` as separate groups`

- [x] AT-E: 通常エッジ（非 ghost / 非 cyclic）の `fromPoint` / `toPoint` は本パスでは変更されない（ポート位置は `distributePorts` に委譲）
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › does not move regular edge ports — leaves geometry to distributePorts`

- [x] AT-F: ghost / cyclic エッジが並列バンドルに含まれる場合、`fromPoint` / `toPoint` がエッジ方向に対して垂直に `(i - (N-1)/2) * 12px` ずれる
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › nudges ghost edges perpendicular to the edge direction` / `... › nudges cyclic edges perpendicular as well` / `... › handles N=3 with symmetric offsets`

- [x] AT-G: ゼロ長 ghost エッジ（`from === to` の自己ループ等）に対して NaN を出さず、ポートも変更しない
  > ✅ Automated — `edge-routing-bundles.test.ts` › `... › does not nudge zero-length ghost edges (avoids NaN)`

- [x] AT-H: バンドル内エッジの SVG ラベル位置は `t = (bundleIndex + 1) / (bundleSize + 1)` でエッジに沿ってスライドする（ユーザが `label-position` を設定していない場合のみ）
  > ✅ Automated — `packages/core/src/renderer/edge-routing.ts` で `style.labelPosition === 0.5` かつ `bundleSize >= 2` のときのみ slide を適用する分岐。AT-A 〜 AT-D の bundle 検出と AT-1184 の `label-position` 上書き挙動の組み合わせでカバー

- [ ] AT-I（manual）: `examples/feature-samples/parallel-edges.krs` を Preview で開き、
  - `Client -> API` の `create` / `update` ラベルが両方読める（重なっていない）
  - `API -> C` の sync 線（実線）と async 線（破線）が両方視認できる
  - すべての矢印頭が見える
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動し、左ペインで `parallel-edges.krs` の内容を貼り付けて確認する

- [ ] AT-J（manual / regression）: 並列エッジを含まない既存の図（`examples/getting-started/index.krs` 等）の SVG が、本変更後も視覚的に変わらない
  > 🧑 Manual — Preview で `examples/getting-started/index.krs` を開き、merge 前後の screenshot 差分を目視で確認

## 補足

- **常時自動**: bundling は opt-out なし。並列が無いケースは no-op で SVG に影響しない（AT-B / AT-J で担保）。将来 `style` で抑止したくなった場合は後方互換に追加可能
- **`distributePorts` との分業**: 通常エッジのポート分散は既存パスに任せる。本パスはラベルスライドと、ghost/cyclic（既存パスがスキップする）の救済のみ担当（AT-E / AT-F）
- **直交ルーティングとの合成**: 本パスは `routeOrthogonalEdges` / `distributeChannelLanes` の後に走るので waypoints が既に決まったエッジに対しては `bundleIndex` / `bundleSize` の付与のみで干渉しない
