# ungrouped レイアウトのルーティングを grouped（P2c）パイプラインと同水準に揃える

- **日付**: 2026-08-04
- **ステータス**: 検討中
- **PR**: [#2338](https://github.com/kompiro/karasu/pull/2338)
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
  Issue も起こさない — 単一 system の row 内が宣言順なのは「書いた順に並ぶ」
  という予測可能性でもあり、問題が観測されてから再検討する（レビューで決定）。

## 検討した選択肢

### 案1: 両ルーターを 1 本の候補列に合成し、両モードで走らせる（併用合成）

`if (groupBands)` の routing fork を廃し、**グループ軸（none / team / boundary）
とルーティング能力を独立の軸として扱う**。両モジュールは残し、共通の候補列に
合成する:

```
straight（clear ならそのまま）
  → 内側 channel L 字（edge-routing-channels.ts — obstacles に frames を
    渡せるよう拡張。grouped ではフレーム障害物で不成立なら次へ）
  → gutter / mixed channel（edge-routing-groups.ts — ungrouped では
    frames: [] で縮退）
```

後段の lane 分離・port fan-out・trunk 集約・marks も両モードで走らせる。
band 順序が前提の `groupBackward` 破線だけは grouped 限定のまま。

なお両ルーターは互いの上位互換ではない: 旧ルーターの「図の内側の channel L」
経路形を新ルーターは持たず（grouped では帯が全幅を占め内側経路が通らないため
不要だった）、逆に旧ルーターは downward 限定で貫通 0 保証もない。合成は
「どちらかに寄せる」のではなく、経路形の語彙を足し合わせる操作になる。

**メリット**

- ungrouped が同層・上向き edge の直交化、mixed channel 迂回、gutter lane
  分離、4 辺 port fan-out を獲得。貫通 0 の柵を ungrouped にも張れる。
- grouped 側も内側 channel L 候補を獲得し、gutter まで出ない近道が増える。
- 単純な図では channel L が先に成立するため、外縁 gutter への遠回りが増えず
  snapshot churn も抑えられる。
- 経路形 1 つ = モジュール 1 つの構成が保たれ、以後の経路形追加も候補列への
  挿入で済む。改善が両モードに同時に効く。
- in-place expansion で既に「ungrouped キャンバス上で grouped ルーターが走る」
  実績があり、リスクの下限が実証済み。

**デメリット**

- ungrouped snapshot の更新（AC-5 の放棄）は避けられない。目視レビューの
  コストが一度発生する。
- grouped の既存 snapshot も内側 channel L の獲得で一部変わる（改善方向だが
  churn は増える）。
- 候補列の順序が両モードの見た目を同時に決めるため、順序変更の影響範囲が
  広がる。

### 案2: `routeOrthogonalEdges` を単独で拡張して追いつかせる

現行 ungrouped ルーターに同層・上向き対応、fallback 時の再試行、lane 参加を
継ぎ足す（grouped 側とは合流しない）。

**メリット**

- snapshot 変化を段階的に制御できる。

**デメリット**

- ADR-1859 が「両モードのロジックが絡む」として却下した形の裏返しで、
  2 系統が**別々に**進化し続ける。候補列合成（案1）と違い改善が片側にしか
  効かない。
- 継ぎ足しの終着点は `edge-routing-groups.ts` の再実装。#1927/#1954 で得た
  教訓（progressively-outer gutter の失敗、素朴 channel routing の overlap）を
  もう一度踏み直すリスクが高い。

### 案1' （案1 の当初形）: grouped パイプラインへ一本化し旧モジュールを削除

検討初期の形。`edge-routing-channels.ts` を削除し、内側 channel L の経路形を
`edge-routing-groups.ts` に吸収して単一モジュール化する。

**却下理由**: グループ軸とルーティング能力は独立の軸であり、経路形ごとに
モジュールを保って候補列で合成する方が、軸の直交性がコード構成に残る
（レビューでの指摘を受けて案1 を併用合成の形に修正）。機能面の到達点は
案1 と同じ。

### 案3: 現状維持（marks 共有のみ）

**メリット**: コストゼロ。
**デメリット**: 貫通が残る ungrouped が既定ビューであり続ける。既定ビューの
品質が opt-in ビューより低い逆転が固定化する。

## 比較

| 観点 | 案1 併用合成 | 案1' 一本化・削除 | 案2 単独拡張 | 案3 現状維持 |
| --- | --- | --- | --- | --- |
| ungrouped の貫通 0 保証 | 可能（柵も移植） | 可能 | 理論上可能だが再発明 | なし |
| grouped への還元 | 内側 channel L を獲得 | 同左 | なし | なし |
| モジュール構成 | 経路形ごとに分離、候補列で合成 | 単一巨大モジュール | 2 系統が別進化 | 2 系統（片方停滞） |
| snapshot churn | 中（channel L が先に成立し遠回りが増えない） | 大（gutter 経由が増える） | 小刻みに複数回 | なし |
| multi-system root への波及 | 同じ候補列を配線するだけ | 同左 | 別途実装 | なし |

## 現時点の方針

**案1（併用合成）を採用する** — グループ軸とルーティング能力を独立の軸として
扱い、両モジュールを共通の候補列（straight → 内側 channel L → gutter/mixed）
に合成して、grouped / ungrouped の両モードで同じパイプラインを走らせる。
grouped で実証済みの品質（貫通 0・overlap 0・決定論）が ungrouped の既定
ビューに届き、逆に ungrouped で実証済みの内側 channel L が grouped に届く。

候補列の順序（内側 channel L を gutter より先に試す）が両モードの見た目を
決める主要パラメータであり、ユーザーレビュー時の主要確認点。

## PoC の実測（2026-08-05, `spike/composed-router`）

方針の妥当性を判断するため、案1 を実装して実サンプル 12 本・18 レイアウトで
計測した。実装差分は `layout.ts` / `edge-routing-channels.ts` /
`edge-routing-groups.ts` の 3 ファイル、+84 / −28 行、新規モジュールなし。

| 指標 | before | after |
| --- | --- | --- |
| 貫通（ungrouped 合計） | 10 | **0** |
| 交差（ungrouped 合計） | 17 | 30（全数 hop マーク付き） |
| 斜め線（ungrouped 合計） | 89 | 81 |
| collinear overlap（縦・横とも） | 0 | 0 |
| grouped 4 レイアウトの全指標 | — | **before と完全一致** |

**得られた知見（当初の想定と食い違った点）:**

1. **churn は想定より遥かに小さい。** 「一度きりの大規模 snapshot 更新」を
   覚悟していたが、実際に更新が必要だったのは commit 済み guide 図 3 枚のみ。
   core 3,108 件・repo 全体 5,651 件のテストが無変更で通過した。
2. **その理由は、ungrouped ルーティングが柵で守られていないため。**
   貫通 10 → 0 という明確な挙動変化に対して落ちたテストが 0 件だった。
   ADR-1859 の AC-5（byte-identity）は**ゲートという構造**で成立していたので
   あり、テストが固定していたわけではない。したがってスライス A の主眼は
   「churn の吸収」ではなく**柵の新設**にある。TPL-1927 の ungrouped 拡張は
   churn 正当化の手段ではなく、それ自体が本体の成果物になる。
3. **ガター迂回が図を横に広げる。** `hr-tool`（貫通 6 の最大ケース）は貫通が
   消える代わりに右側にガター経由の走行帯ができ、図幅が約 10% 増えた。交差
   4 → 11 もこの走行帯どうしの交差である。数値（貫通・overlap）には表れない
   品質劣化なので、スライスを分けて別途扱う（スライス D）。
4. **ラベルが他エッジの線に乗る問題は本件と独立**（before 18 / after 20）。
   ADR-2048 の障害物集合がエッジ polyline を含まないことが原因で、grouped /
   ungrouped の双方で発生する既存欠陥。[#2360](https://github.com/kompiro/karasu/issues/2360)
   として分離した。

### スライス（実装ステップ）

PoC の結果を受けて 4 スライスに分割する。当初 3 スライスに **D** を追加したのは、
PoC で「貫通ゼロ（正しさ）」と「図のコンパクトさ（見た目）」が別々に動く量だと
判明したため。A だけでも貫通ゼロは達成でき、D は独立に効果を測れる。

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 単一 system を共通候補列へ切替 + 柵の新設 | — | grouped は PoC で全指標不変を実証済み。ungrouped は貫通 10 → 0 で、悪化する指標は交差のみ（全数 hop マーク付きで ADR-1859 のスタンス内） |
| **B** multi-system root へ同候補列を配線 | A | root view は現状ルーティングが皆無なので純増。A で確立した柵をそのまま適用できる |
| **C** ungrouped での trunk 集約の評価・適用判断 | A | trunk なしでも A の貫通 0 は成立。評価の結果「見送り」も許容する。external サイド配置（ADR-1728）と trunk lane が外縁で初めて同居するため、A の結果を見てからでないと評価できない |
| **D** ガター迂回の距離を抑える中間候補の追加 | A | A が作った「図が横に広がる」縮退の緩和。候補列への挿入なので A の貫通ゼロを壊さず、効果は図幅と交差数で独立に測れる |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#2330](https://github.com/kompiro/karasu/issues/2330) の `## Slice status` を参照。

### 実装の指針

1. **A**: `layout.ts` のルーティング fork を廃し、共通の候補列
   （straight → channel L → gutter/mixed）を両モードに配線する。
   `edge-routing-channels.ts` は残し、obstacles を外から受け取れるよう拡張
   （grouped ではフレーム片を含む障害物集合、ungrouped では従来どおりノード
   カードのみ）。downward 限定も外し、channel L が不成立なら
   `edge-routing-groups.ts` の gutter/mixed に落ちる。ungrouped では
   `frames: []`、`groupBackward` は band 情報なしとして skip。
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
5. **D**: 候補列の 1 と 2 の間に中間候補（最寄りの列間を縦に降りる回廊）を
   挿入し、外縁ガターまで出る経路を減らす。効果は**図幅**と交差数で測る
   （貫通・overlap は A が 0 にしているので判定材料にならない）。
6. AT: `docs/acceptance/` に ungrouped ルーティングの AT を追加。TC は:
   - 同層・上向き edge が直交化され貫通しない
   - external 左右配置（ADR-1728）の見た目が保たれる
   - Group by 切替で edge の identity（id selector / direction style）が保たれる
7. ADR 昇格: 実装完了後、ADR-1859 の AC-5 を部分 supersede する ADR を
   `docs/adr/2330-ungrouped-routing-parity.md` として起こし、本 Design Doc は
   同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ungrouped ビューの edge 経路が変わる（貫通の解消・
  直交化）。図が横に広がるケースがある（スライス D で緩和）。`.krs` 文法・
  スタイルへの影響なし。
- ドキュメント更新: `docs/spec/` への影響なし（view-mode 局所）。
  必要なら `docs/concepts.md` のレイアウト説明を微修正。
- テスト・examples への影響: PoC 実測で、更新が必要なのは commit 済み guide 図
  3 枚のみ（`pnpm gen:guide-diagrams` で再生成）。既存テストの失敗は 0 件。
  examples の `.krs` 自体は不変。

## 決めたこと（レビューでの解消記録）

- **実装は 4 スライスに分割する**（A / B / C / D — 上の「スライス」節）。
  PoC で「貫通ゼロ（正しさ）」と「図のコンパクトさ（見た目）」が別々に動く量
  だと判明したため、当初の 3 スライスに D（ガター迂回の距離を抑える中間候補）
  を追加した。各スライスは sub-issue として親 [#2330](https://github.com/kompiro/karasu/issues/2330)
  に登録し、到達点の一覧は親 Issue の `## Slice status` が持つ。
- **スライス C（trunk 集約）は本プログラムに含める**。評価スライスとし、
  「評価の結果見送り」も許容する。
- **barycenter は起票しない**。宣言順の予測可能性を維持し、問題が観測されて
  から再検討する（「制約・前提」の out of scope 参照）。
- **旧ルーターはモジュールごと残して併用合成する**。グループ軸（none / team /
  boundary）とルーティング能力の切り替えは独立の軸であり、boundary / team の
  どちらのグループでも edge-routing の全能力が使え、グループなしでも gutter
  ルーティングが使える状態を到達点とする（案1' の却下理由も参照）。
- **常時矩形線化（斜め線の廃止）は見送り、straight-if-clear を維持する**。
  「clear なエッジも Z/L 字に折って図全体を直交線で統一する」案
  （ADR-1859 が #1939 案A/B として却下したものの再訪）を検討した。本プログラム
  は当時の却下理由のうち snapshot churn と overlap パス不参加を解消するため
  再訪の好機ではあったが、Z 折りが斜め線には無かった新交差を生むこと、塞がれた
  場合の直線 fallback で完全な統一にはならないことは残る。交差は hop マークで
  無害化する現行スタンスを継続する。なお同層は水平線・x が揃った隣接行は垂直線
  と、真横・真上下の接続は既に矩形線であり、本判断が変えるのは斜め線の扱い
  だけである。
- **ラベルがエッジの線に乗る問題は本件から分離する**。ADR-2048 の障害物集合が
  エッジ polyline を含まないことが原因の既存欠陥で、grouped / ungrouped の
  双方で発生し（実測 before 18 / after 20 件）、本設計の候補列合成とは独立に
  直せる。[#2360](https://github.com/kompiro/karasu/issues/2360) として起票済み。
- **reach strip（フレーム coverage 適応）の ungrouped 開放は不要**。
  ungrouped には帯外メンバーを持つフレームが構成的に存在せず（in-place
  expansion は帯機構で連続配置、multi-system frame は system ブロック内で
  完結）、ノード間の繋がりの表示はエッジ（本プログラムで矩形線化能力を獲得）で
  足りる。レンダリング側（`ContainerRect.coverage` / 縮退タブ）は既に共有
  データであり、将来 ungrouped 側に帯外メンバーを持つフレームが生まれたら
  `buildGroupFrames` に `reach` を渡すだけで開放できる。
