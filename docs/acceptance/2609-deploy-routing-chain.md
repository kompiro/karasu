---
type: product
---

# AT: deploy view を共有配線チェーンに載せる（#2609）

- **日付**: 2026-09-04
- **関連 Issue**: [#2609](https://github.com/kompiro/karasu/issues/2609)（親: [#2598](https://github.com/kompiro/karasu/issues/2598) スライス B）、[#2490](https://github.com/kompiro/karasu/issues/2490)（親に統合された repro）
- **Related TPLs**: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並列関数のパリティ）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）, [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい route 形が overlap 回避パスを素通りしない）
- **対象ファイル**:
  - `packages/core/src/renderer/deploy-layout.ts`（コンテナを box として共有チェーンへ渡す。`ghost` は配線後に付ける style flag）
  - `packages/core/src/renderer/layout.ts`（in-place expansion の band stack を配線の grouped 判定に使わない）
  - `packages/core/src/renderer/layout-edges.ts`（共有チェーン）

> `layoutDeploy` は `runRoutingChain` を一度も呼ばず、コンテナ辺の中心同士を直線で結んでいた。同じコンテナへ入る全エッジが 1 点に集まり（dify の deploy 16 本中 12 本が同一座標で終端）、間にあるコンテナを貫通していた。**コンテナ自体を配線の box にして system view と同じチェーンを通す。** deploy エッジは muted な ghost group に描かれるが、チェーンは ghost を飛ばすので、flag は配線の後に付ける。
>
> 親に統合された #2490 の repro（3 つの service を in-place 展開し、S1 → S3 を sync / async の 2 本）は、展開が group band の仕組みを借りるためチェーンが grouped と判定し、P2c-B の trunk 集約が 2 本を 1 本の spine と 1 つの target entry に束ねていた。Group-by 軸があるときだけ band stack を渡す。

## 受け入れ条件

### AC-1: deploy エッジが 1 点に集中せず、コンテナを貫通しない

- [x] AT-A: 4 本が 1 つのコンテナへ入る fixture で、終端が 4 つとも異なる

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy routes container edges through the shared chain (#2609)` › `fans the edges into one container out along its side`

- [x] AT-B: 端点の間に別のコンテナがあるとき、直線でなく迂回し、貫通 0

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy routes container edges through the shared chain (#2609)` › `routes around a container that sits between the endpoints`

- [x] AT-C: bundled examples の deploy view（getting-started / payment-platform / deploy）で、終端しないコンテナへの貫通 0、両軸の collinear overlap 0、端点の共有 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `deploy view routes through the shared chain (#2609, TPL-219)` › `%s: no edge pierces a container it does not terminate on` ／ `%s: no two edges share a collinear corridor` ／ `%s: no two edges share an endpoint`

### AC-2: deploy view が共有チェーンを通る（TPL-219）

- [x] AT-D: 配線後も全エッジが muted な ghost group に残る（`ghost` は style であって配線の gate ではない）

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy routes container edges through the shared chain (#2609)` › `keeps every edge in the muted ghost group after routing`; `packages/core/src/renderer/deploy-renderer.test.ts` › `renderDeploy` › `includes ghost edge group`

- [x] AT-E: ガター経路がコンテナの外へ出てもキャンバスに収まり、座標が負にならない

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy routes container edges through the shared chain (#2609)` › `keeps the canvas around a route that leaves the content`

- [x] AT-F: 決定的である

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy routes container edges through the shared chain (#2609)` › `is deterministic`

- [x] AT-G: 既存の deploy レイアウト・レンダラ・diff のテストが通る（bundled deploy 21 view のうち変わるのは、エッジを持つ 5 view の配線だけ）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

### AC-3: #2490 の repro で回廊と anchor を共有しない

- [x] AT-H: in-place 展開した S1 → S3 の 2 本が別々の target anchor を持つ

  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `layout — in-place expansion keeps parallel edges apart (#2490, via #2598)` › `gives the two S1 -> S3 edges distinct target anchors`

- [x] AT-I: 2 本の segment が共線で重ならない

  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `layout — in-place expansion keeps parallel edges apart (#2490, via #2598)` › `lays no collinear segment of one on a segment of the other`

- [x] AT-J: 展開フレームのうち自分が属さないものを貫通しない

  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `layout — in-place expansion keeps parallel edges apart (#2490, via #2598)` › `keeps every edge clear of the frames it does not belong to`

## 手動確認

自動テストは座標を判定できるが、「2 本に見えるか」は実機でしか判定できない。到達先は公開アプリ（`https://karasu.kompiro.dev/`）。`index.krs` に次を貼り、system view で S1・S2・S3 を in-place 展開する。

```krs
system T {
  service S1 { domain A { usecase u } }
  service S2 { domain B { usecase v } }
  service S3 { domain C { usecase w } }
  S1 -> S3
  S1 --> S3
  S1 -> S2
  S2 -> S3
}
```

- [ ] 🧑 Manual: S1 → S3 の実線と破線が別々の回廊を通り、S3 の別々の点に入る（重なって 1 本に見えない）
- [ ] 🧑 Manual: deploy view で、同じコンテナへ入る複数のエッジが辺に沿って分かれて終端し、間のコンテナを貫通していない（`examples/en/deploy/system.krs` の Production）
