---
type: product
---

# AT: キャンバスの空き空間を最小にする行幅予算を選ぶ（#2593）

- **日付**: 2026-08-25
- **関連 Issue**: [#2593](https://github.com/kompiro/karasu/issues/2593)
- **Related TPLs**: [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)（レイアウトのフィードバックは floor-first かつ単調）, [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)（単一ビューの解像度）, [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並列関数のパリティ）, [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モード横断）
- **対象ファイル**:
  - `packages/core/src/renderer/aspect-search.ts`（候補列・帯判定・面積最小の探索）
  - `packages/core/src/renderer/layout.ts`（`layout()` が探索を回す）
  - `packages/core/src/renderer/layer-layout-logics.ts`（列キャップの緩和）
  - `packages/core/src/renderer/deploy-layout.ts`（コンテナ内 unit の grid + 探索）

> 幅は `GRID_COLUMN_CAP` と `MAX_LAYER_WIDTH` で二重に縛られ、高さは一度も縛られていなかった。出来上がったバウンディングボックスを読み返す経路がパイプラインに無いため、カードがわずかに太いだけで 1 行 2 枚に折り返され、以降はひたすら下に伸びる。**帯（縦 16:9〜横 16:9）に収まる候補のうちキャンバス面積が最小のもの**を選ぶ。中身の面積は候補によらず一定なので、面積最小 = 空き最小。

## 受け入れ条件

### AC-1: 縦長のキャンバスが帯の内側に入る

- [x] AT-A: 幅の広いカードが多数並ぶビューで、探索が下限より広い予算を選び、比率が 9:16〜16:9 の帯に収まる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `pulls a canvas that would render as a tall ribbon inside the aspect band`

- [x] AT-B: 採点は最終キャンバスで行う。外部ノードの側面カラムを持つビューが、探索によって横長側へ振り切れない

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `scores the final canvas, not the layered content box`

### AC-2: 既に収まっている図は動かない（floor-first）

- [x] AT-C: すでに横長のキャンバスは下限予算のまま選ばれる（＝出力が変わらない）

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `leaves an already-landscape canvas on the floor budget`; `packages/core/src/renderer/aspect-search.test.ts` › `searchWidthBudget` › `keeps the floor when widening only trades one axis for the other`

- [x] AT-C2: 帯の内側にいる下限候補が、面積のより大きい widened 候補に負けない（厳密比較そのものの固定。帯の外で早期打ち切りするケースでは、この比較は一度も実行されない）

  > ✅ Automated — `packages/core/src/renderer/aspect-search.test.ts` › `searchWidthBudget` › `defends the floor against a wider candidate whose canvas is larger`

- [x] AT-D: 既存のレンダリング系テスト（core 137 ファイル）がスナップショットの書き換えなしで通る

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（3,937 件 green。探索の下限が現行定数で、勝つには厳密に小さい面積が要るため既存フィクスチャは不変）

### AC-3: 決定的である

- [x] AT-E: 同じ入力を 2 回レイアウトすると座標が完全に一致する

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `is deterministic: identical input produces identical coordinates`; `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy > container units wrap into a grid (#2593)` › `is deterministic`

- [x] AT-F: 候補列は入力と定数だけから決まり、整数で安定している

  > ✅ Automated — `packages/core/src/renderer/aspect-search.test.ts` › `candidateWidthBudgets` › `is deterministic and integral` ／ `starts at the floor and ascends`

- [x] AT-G: 帯に入る候補が 1 つも無い場合と、0 × 0 の退化キャンバスでも結果が返る

  > ✅ Automated — `packages/core/src/renderer/aspect-search.test.ts` › `searchWidthBudget` › `falls back to the least-bad canvas when none fits the band` ／ `searchWidthBudget > degenerate canvas` › `returns the first run when every candidate measures 0 x 0`

### AC-4: deploy コンテナ内の unit が grid に畳まれる

- [x] AT-H: unit を多数持つコンテナが 1 列にならず、複数行・複数列に畳まれる

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy > container units wrap into a grid (#2593)` › `does not stack many units in a single column`

- [x] AT-I: コンテナの外形が中の grid と一致する（unit が枠外に出ない）

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy > container units wrap into a grid (#2593)` › `keeps the container box in agreement with the grid it holds`

- [x] AT-J: unit が 3 個以下のコンテナは従来どおり 1 列のまま（小さいコンテナまで grid 化すると、行とキャンバスが横に広がって既存の deploy 図が全部大きくなる）

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `layoutDeploy > container units wrap into a grid (#2593)` › `leaves a small container in the single column it always had` ／ `starts gridding at the fourth unit`

- [x] AT-J2: 束ねられた deploy view 20 件が main と完全に一致する（この変更で大きくなる既存図が無い）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（deploy-layout のスナップショット系）。実測でも 20 view 中 0 件が変化

### AC-4b: 探索が前提にしている性質を固定する

- [x] AT-H2: 配置は予算に対して**単調ではない**（カード高が不揃いだと高さが増えうる）ことを反例で固定し、単調性を根拠にした打ち切りを再導入させない

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > width budget (#2593)` › `is NOT monotone in the budget once card heights differ` ／ `is monotone in the budget when every card is the same height`（成り立つ範囲の明示）

- [x] AT-H2b: 探索は帯を外れた候補で打ち切らず、全候補を評価した総当たりと同じ結果を返す

  > ✅ Automated — `packages/core/src/renderer/aspect-search.test.ts` › `searchWidthBudget` › `keeps evaluating past a candidate that leaves the band` ／ `returns the smallest in-band canvas, matching an exhaustive scan`

- [x] AT-H3: 予算をいくら広げても ADR-1737 の列規則は変わらない（少数の兄弟が 1 行に伸ばされない）

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > width budget (#2593)` › `keeps ADR-1737's column rule whatever the budget is`

- [x] AT-H4: 行の折り返しが幅予算由来かどうかを報告し、由来しない場合は探索を 1 回で打ち切れる

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > width budget (#2593)` › `reports whether the width bound was the binding constraint`

- [x] AT-H5: icon mode でも探索が走り、そのモード自身の下限（1040）から候補を作る

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `searches in icon mode too, from that mode's own floor`

### AC-5: 著者指定と適用範囲

- [x] AT-K: `grid-columns` の著者指定は探索より優先される

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > balanced grid wrapping (#1737)` › `honors a grid-columns hint on the container, overriding the auto count`

- [x] AT-K2: multi-system root（system を横に並べる経路）でも探索が走り、結果が有限で下限以上になる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `runs on the multi-system root, whose systems sit side by side`

- [x] AT-L: 1 ノードだけの層が連なるモデルは変化しない（本 Issue のスコープ外であることの固定）

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > canvas space objective (#2593)` › `cannot help a chain of single-node layers (out of scope, needs layer folding)`

## 手動確認

自動テストは座標と比率を判定できるが、「空白が減って読みやすくなったか」と「表示モードを切り替えても同じ図に見えるか」は実機でしか判定できない。到達先は公開アプリ（`https://karasu.kompiro.dev/`）。

- [ ] 🧑 Manual: 多数のドメインを持つサービスのドリルダウンを開き、縦に長いリボンではなく画面に収まる形で表示される
- [ ] 🧑 Manual: deploy ビューで、多数の unit を持つコンテナが縦長の帯ではなく grid で表示される
- [ ] 🧑 Manual: 同じモデルを icon mode と shape mode で切り替えても、配置の印象が大きく変わらない（[ADR-1000](../adr/1000-icon-mode-layout-gap-tuning.md) が案 2 を却下した理由への確認。候補列がモードごとの下限から作られるため、両モードが別の列数に落ち着くこと自体はありうる）
