---
type: product
---

# AT: 同じ行の 2 枚を結ぶエッジを、行の上下の行間チャネルで回す（#3026）

- **日付**: 2026-10-12
- **関連 Issue**: [#3026](https://github.com/kompiro/karasu/issues/3026)
- **関連 ADR**: [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)、[ADR-2330](../adr/2330-ungrouped-routing-parity.md)、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)
- **Related TPLs**: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-groups.ts`（`trySameRowChannelRoute` / `channelStub`）、`packages/core/src/renderer/edge-geometry.ts`（`countPolylineCrossings`）

> 同じ行に並んだ 2 枚の間に別のカードがあると、2 枚を結ぶエッジは間のカードを直線で突き抜けていた。端点が縦に重なる組を受け付ける候補が無かったためで、行のすぐ上か下の行間チャネルを U 字に回る候補を足す。

## 受け入れ条件

fixture は、互いに両方向で依存する domain を 1 行に並べたもの 3 種: 3 枚、3 枚で中央だけ背が高いもの、5 枚。

### AC-1: 同じ行の組が間のカードを貫通しない

- [x] AT-A: どの fixture も全カードが 1 行に並び、隣り合わない組の中心どうしの直線はカードを貫通する（fixture が形に届いている）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `same-row pair around the card between (#3026, TPL-3026 / TPL-1927)` › `%s: the fixture puts every card in one row, and a chord on a card`

- [x] AT-B: どの fixture でも、貫通 0、両軸の collinear overlap 0。修正を外すと落ちる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `same-row pair around the card between (#3026, TPL-3026 / TPL-1927)` › `%s: no edge pierces a card, and no two edges share a collinear segment`

- [x] AT-C: 行を回る経路の折れ点は、すべて行の上端より上か下端より下にある。5 枚の行では、最上段の上（と最下段の下）のチャネルに 5 本のレーンが積まれ、行へ向かって広がらない。レーン配置を修正前に戻すと落ちる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `same-row pair around the card between (#3026, TPL-3026 / TPL-1927)` › `%s: every route round the row stays clear of the row`

- [x] AT-D: 5 枚の行では、行を回る経路どうしが交差し、交差には hop が付く

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `same-row pair around the card between (#3026, TPL-3026 / TPL-1927)` › `five cards: the routes round the row cross, and every crossing carries a hop mark`

### AC-2: 上下の選び方

- [x] AT-E: 両方向のエッジがある組は、行の上と下に分かれて 1 つのループになる（交差が同数のときの時計回り）。中央のカードが背の高い行でも同じで、下側のチャネルは 2 枚だけでなく、間に立つカードも含めた高さから測られる（2 枚の高さで測ると中央のカードに入り、両方とも上を回る）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `same-row pair around the card between (#3026, TPL-3026 / TPL-1927)` › `%s: the outer pair goes round the row on opposite sides, as one loop`

- [x] AT-F: 交差の数え方は真の交差だけで、接触・端点の共有・共線の重なりは数えない

  > ✅ Automated — `packages/core/src/renderer/edge-geometry.test.ts` › `countPolylineCrossings (#3026)` › `counts a segment that crosses another at an interior point`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-geometry.test.ts` › `countPolylineCrossings (#3026)` › `does not count a touch, a shared end or a collinear overlap`

- [x] AT-G: 行の高さに取り込むのは 2 枚と、x 方向でその間に立つカードだけ。2 行にまたがる側面列のカードは取り込まず、下側のチャネルは次の行より上に残る。取り込みは増えなくなるまで繰り返し、カードの走査順に依らない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-same-row.test.ts` › `same-row route measures the row it goes round (#3026)` › `leaves a side-column card out of the row, so the channel below stays above the next row`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-same-row.test.ts` › `same-row route measures the row it goes round (#3026)` › `takes in every card between the pair, whatever order the cards are visited in`

### AC-3: 該当しない図は変わらない

- [x] AT-H: `examples/` の全モデルと既存の routing fence・スナップショットが無変更で通る。grouped キャンバスは対象外（チャネルを枠を見ずに測るため。corridor / staircase と同じ）。4 つの逆生成モデル（1,542 ビュー）で経路が変わるのは同じ行の貫通があった 5 ビューだけで、collinear overlap は増えない（`reports/3026-same-row-chord/` で計測）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

## 手動確認

判定に「読めるか」の目が要る 1 項目。app（https://karasu.kompiro.dev/）で下のモデルを `index.krs` として開き、`S › App` まで drill-down する（Group by: none）。

```krs
system S {
  service App {
    domain A {
      A -> B
      A -> C
    }
    domain B {
      B -> A
      B -> C
    }
    domain C {
      C -> A
      C -> B
    }
  }
}
```

- [ ] 両端の 2 枚を結ぶ 2 本が、中央のカードを通らず、行の上と下を回る 1 つのループとして読める。矢印の向きで、どちらの線がどちら向きか分かる
