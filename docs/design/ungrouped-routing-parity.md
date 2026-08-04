# ungrouped レイアウトのルーティングを grouped（P2c）パイプラインと同水準に揃える

- **日付**: 2026-08-04
- **ステータス**: 検討中
- **PR**: （作成後に記入）
- **関連**:
  - 引き金 Issue: [#2330](https://github.com/kompiro/karasu/issues/2330)
  - 関連 ADR: [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（ungrouped ルーターの現行憲章）,
    [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c。AC-5「Group by: none 不変」を本設計が部分的に覆す）,
    [ADR-1728](../adr/1728-external-on-sides-layout.md)（external 左右配置 — ungrouped 固有の配置と新ルーターの相互作用）,
    [ADR-1185](../adr/1185-parallel-edge-bundling.md)（edge identity 保持の立場を継承）
  - 関連 TPL: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md),
    [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md),
    [TPL-1736](../test-perspectives/TPL-1736-tier-split-no-edge-penetration.md),
    [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md),
    [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md),
    [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)
  - コード: `packages/core/src/renderer/layout.ts` / `edge-routing-channels.ts` / `edge-routing-groups.ts` / `edge-routing-lanes.ts` / `edge-routing-ports.ts`

## 背景・課題

P2c（ADR-1859）以降、grouped ビューのルーティングは gutter 経路・mixed channel
経路（#1954）・gutter lane 分離・4 辺 port fan-out・集約 trunk まで揃い、
実サンプルで **node/frame 貫通 0** を assert できる水準に達した。一方
ungrouped（Group by: none）のルーティングは ADR-968 の
`routeOrthogonalEdges`（downward edge 限定の 1 段 L 字、衝突が残れば直線に
fallback）のままで、次のギャップがある。

- 同層・上向き（逆流）edge は常に直線。設計計測
  （`system-view-grouping.md` § 計測 5、ADR-1859 に集約済み）では直線モックの
  illegibility の主因は貫通（38 本）だった。
- L 字が塞がれた場合は貫通したまま直線に戻る（貫通 0 の保証がない）。
- multi-system root（`layoutMultipleSystems`）に至っては port 分散・直交
  ルーティング・lane 分離のいずれも走らず、grouped にしても edge は直線のまま
  （`layout-types.ts` に既知の縮退として明記されている）。

このギャップは構造的なものではない。ADR-1859 が AC-5
「Group by: none は byte-identity で温存」を**意図的に**選び、
`if (groupBands)` gate で新パスを封印した結果である。同 ADR は却下案として
「既存 `routeOrthogonalEdges` へのフレーム対応の継ぎ足し」を snapshot 破壊
リスクを理由に退けたが、逆方向（grouped パイプラインを ungrouped にも使う）は
検討スコープ外だった。

gate を緩めた先例は既に 2 つある:

1. in-place expansion（#1921/#1955）は Group by: none でも `expandMembership`
   から `groupBands` を組み立て、grouped ルーターを走らせている。
2. 交差 hop マークは #1956 で ungrouped にも共有された。

## 現状（インベントリ）

| パス | ルーティング内容 | 貫通保証 |
| --- | --- | --- |
| grouped（`groupBands != null`） | `routeGroupedEdges`（gutter / mixed channel）→ `aggregateGroupTrunks` → `distributeGutterLanes` → `fanOutGutterPorts` | 貫通 0 を AT で assert（TPL-1927/1954） |
| ungrouped 単一 system | `routeOrthogonalEdges`（downward のみ、失敗時直線 fallback） | なし（fallback で貫通が残る） |
| multi-system root | なし（`markParallelBundles` のみ。port 分散・lanes・marks も無し） | なし |

grouped ルーター群の frames 依存は `obstaclesFor()` / `contentBounds()` の
2 箇所だけで、いずれも空配列で縮退する（frames 無し = ノードカードのみが
障害物）。つまり geometry としては ungrouped にそのまま適用できる。

grouped 固有で ungrouped に適用しない（する意味がない）もの:
group frame 描画・reach strip・縮退 membership タブ・min-FAS group 順序・
co-membership/seam bias・group diff 配置（#1886）・`groupBackward` 破線
（band 順序が前提）。

## 制約・前提

- **AC-5 の supersede が必要**: ungrouped の snapshot 群が広範に変わる。
  ADR-1859 を書き換えず、新 ADR で AC-5 部分を supersede する
  （`docs/process.md`「既存 ADR を見直すとき」）。
- **決定論は維持**: 全経路はノード座標のみから導出（ADR-968 と同じ規律）。
  乱数・DOM metric 依存を持ち込まない。
- **edge identity 保持**: `edge#<id>` selector / direction style / diff renderer
  が edge 単位で動くため、trunk を導入する場合も描画合流に留める
  （ADR-1185 / ADR-1859 の立場を継承）。
- **ADR-968 の却下案は再訪しない**: A\*（B1）・スプライン（B2）・ELK（B3）・
  ノード再配置（B4）の却下理由は本設計でも成立する。本設計は「どのルーターを
  使うか」の付け替えであり、探索アルゴリズムの再選定ではない。
- **ungrouped 固有の配置は保つ**: external 左右配置（ADR-1728、
  `placeExternalServicesOnSides`）・tier 分割（ADR-1724）・actor row
  （ADR-967）は変更しない。新ルーターは side-anchored external の anchor を
  尊重すること（TPL-1761）。
- **out of scope**: 配置アルゴリズム自体の改善（barycenter 導入・#966 系の
  crossing 最小化）はルーティングと独立の論点なので本設計に含めない。
  必要なら別 Issue を起こす。

## 検討した選択肢

### 案1: grouped パイプラインを frames 空で ungrouped にも通す（単一ルーター化）

`if (groupBands)` の分岐を「常に grouped パイプライン」へ畳む。ungrouped では
`frames: []`・trunk/backward 判定は band 情報が無いので自然に縮退（または明示
skip）。`routeOrthogonalEdges`（`edge-routing-channels.ts`）は退役させ、
`distributeChannelLanes` など共有パスは残す。

**メリット**

- ungrouped が同層・上向き edge の直交化、mixed channel 迂回、gutter lane
  分離、4 辺 port fan-out を即座に獲得。貫通 0 の柵を ungrouped にも張れる。
- ルーターが 1 系統になり、以後の改善（#1954 のような fix）が両モードに同時に
  効く。二重メンテが消える。
- in-place expansion で既に「ungrouped キャンバス上で grouped ルーターが走る」
  実績があり、リスクの下限が実証済み。

**デメリット**

- ungrouped snapshot の大規模更新（AC-5 の放棄）。目視レビューのコストが
  一度発生する。
- grouped ルーターは gutter（キャンバス外縁）経由を好むため、単純な図では
  現行の「素直な L 字」より遠回りな経路になるケースがありうる。経路選択の
  優先順位（straight → 現行 L 字相当 → gutter/mixed）の調律が必要。

### 案2: `routeOrthogonalEdges` を拡張して追いつかせる

現行 ungrouped ルーターに同層・上向き対応、fallback 時の再試行、lane 参加を
継ぎ足す。

**メリット**

- snapshot 変化を段階的に制御できる。

**デメリット**

- ADR-1859 が「両モードのロジックが絡む」として却下した形の裏返しで、
  結局 2 つのルーターを恒久メンテすることになる。
- 継ぎ足しの終着点は `edge-routing-groups.ts` の再実装。#1927/#1954 で得た
  教訓（progressively-outer gutter の失敗、素朴 channel routing の overlap）を
  もう一度踏み直すリスクが高い。

### 案3: 現状維持（marks 共有のみ）

**メリット**: コストゼロ。
**デメリット**: 貫通が残る ungrouped が既定ビューであり続ける。既定ビューの
品質が opt-in ビューより低い逆転が固定化する。

## 比較

| 観点 | 案1 単一ルーター化 | 案2 現行拡張 | 案3 現状維持 |
| --- | --- | --- | --- |
| ungrouped の貫通 0 保証 | 可能（柵も移植） | 理論上可能だが再発明 | なし |
| メンテ系統 | 1 系統 | 2 系統恒久化 | 2 系統（片方停滞） |
| snapshot churn | 一度に大 | 小刻みに複数回 | なし |
| 実証済みの土台 | あり（P2c + expansion 先例） | なし | — |
| multi-system root への波及 | 同じパスを配線するだけ | 別途実装 | なし |

## 現時点の方針

**案1 を採用する** — ルーターを 1 系統に畳み、grouped で実証済みの品質
（貫通 0・overlap 0・決定論）を ungrouped の既定ビューに移植する。snapshot
churn は一度きりのコストであり、TPL-1927 の crossing/penetration 計測を
ungrouped fixture（`getting-started` ほか実サンプル）へ拡張して before/after を
数値で示すことで、目視レビューの負担を「悪化していないことの確認」まで下げる。

経路選択の優先順位は「straight が clear なら straight → 帯間チャネル L 字
（現行 ADR-968 相当）→ gutter/mixed」とし、単純な図の見た目を現行から
大きく変えない。この優先順位はユーザーレビュー時の主要確認点。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 単一 system ungrouped を共通パイプラインへ切替 + 計測柵 | — | grouped は不変。ungrouped は計測（貫通数減）で悪化がないことを PR 内で示す |
| **B** multi-system root へ同パイプラインを配線 | A | root view は現状ルーティング皆無なので純増。A で確立した柵をそのまま使う |
| **C** ungrouped での trunk 集約の評価・適用判断 | A | trunk なしでも A の貫通 0 は成立。C は可読性の追加改善で、評価の結果「見送り」も許容 |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#2330](https://github.com/kompiro/karasu/issues/2330) の `## Slice status` を参照。

### 実装の指針

1. **A**: `layout.ts` のルーティング fork を共通化。ungrouped では
   `frames: []` を渡し、`groupBackward` / trunk は band 情報なしとして skip。
   `routeOrthogonalEdges` と `edge-routing-channels.ts` を削除（knip が
   dead code を検出することを確認）。経路優先順位（straight → channel L →
   gutter/mixed）を router 側に実装。
2. **A の柵**: TPL-1927 の二重計測（crossing + penetration）を ungrouped
   fixture へ拡張し、実サンプル（`examples/` の `getting-started` 等）で
   **貫通 == 0 / collinear overlap == 0** を assert。TPL-1761（external
   左右配置の anchor 不変）と TPL-1736（tier 分割で貫通なし）の既存 assert が
   通ることを確認。TPL-2048 のラベル配置計測も再実行。
3. **B**: `layoutMultipleSystems` に `distributePorts` → 共通ルーター →
   lanes → marks を配線。grouped multi-system root（帯 + frame は既にある）にも
   同時に効く。
4. **C**: 共有 infra/external target への fan-in が多い実サンプルで trunk
   集約の有無を比較し、採用可否を判断。採用時も junction dot 規約
   （ADR-1859 P2c-C）をそのまま使う。
5. AT: `docs/acceptance/` に ungrouped ルーティングの AT を追加。TC は:
   - 同層・上向き edge が直交化され貫通しない
   - external 左右配置（ADR-1728）の見た目が保たれる
   - Group by 切替で edge の identity（id selector / direction style）が保たれる
6. ADR 昇格: 実装完了後、ADR-1859 の AC-5 を部分 supersede する ADR を
   `docs/adr/2330-ungrouped-routing-parity.md` として起こし、本 Design Doc は
   同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ungrouped ビューの edge 経路が変わる（貫通の解消・
  直交化）。`.krs` 文法・スタイルへの影響なし。
- ドキュメント更新: `docs/spec/` への影響なし（view-mode 局所）。
  必要なら `docs/concepts.md` のレイアウト説明を微修正。
- テスト・examples への影響: ungrouped の snapshot 大規模更新（一度きり）。
  examples の `.krs` 自体は不変。

## 未解決の問い

- **スライス C（trunk 集約）を本プログラムに含めるか**: 含めて「評価の結果
  見送り」も許容する形を提案するが、最初から切り離して別 Issue でもよい。
- **barycenter（単一 system の row 内順序が宣言順のみ）**: 本設計は out of
  scope としたが、別 Issue として起票するか。
- **`routeOrthogonalEdges` の扱い**: 完全削除（提案）か、フォールバックとして
  残すか。残す場合は 2 系統メンテが続くため、削除を推奨する。
