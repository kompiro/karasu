# キャンバスの空き空間を目的関数にする

- **日付**: 2026-08-23
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2593](https://github.com/kompiro/karasu/issues/2593)
  - 関連 ADR: [ADR-1737](../adr/1737-balanced-grid-sibling-layout.md)（兄弟軸の balanced grid）, [ADR-1000](../adr/1000-icon-mode-layout-gap-tuning.md)（icon mode の gap 調整。密グリッドパッキングを却下）, [ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）, [ADR-649](../adr/649-drawio-export.md)（draw.io export を escape hatch とする）
  - 関連 TPL: [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md), [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md), [TPL-1790](../test-perspectives/TPL-1790-root-svg-viewbox-responsive.md), [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md), [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)（本 PR で起こす proactive TPL）
  - コード: `packages/core/src/renderer/layer-layout-logics.ts`, `layout.ts`, `deploy-layout.ts`, `layout-constants.ts`

## 背景・課題

深いモデルを開くとキャンバスが縦長のリボンになる。zoom-to-fit は高さでスケールを決めるので、
カードは読める解像度を割り、画面の大半が空白のまま残る。`docs/concepts.md` の scoped glance
（解像度の軸）が要求している「一目で把握できる解像度」を、ナビゲーションではなく単一ビューの
レイアウトが崩している状態で、[ADR-1737](../adr/1737-balanced-grid-sibling-layout.md) が
兄弟軸に対して解いた問題がレイヤー軸で再発している。

reverse-engineer した dify モデル（10,093 行 / 41 view）で実測した代表値:

| モデル | viewBox | 比率 | 16:9 で zoom-to-fit したときの横幅利用率 |
| --- | --- | --- | --- |
| deploy view | 1274 × 3686 | 0.35 | 約 9% |
| `service/ApiBackend` | 1173 × 1858 | 0.63 | 約 35% |
| 兄弟 30 個フラット | 1200 × 856 | 1.40 | 良好 |

フラットな例が良好なのは #1737 が兄弟軸を直したためで、症状は同じ違反の 90 度回転である。

## 現状（インベントリ）

ノード座標を決める合流点は `placeNodesInLayers`（`layer-layout-logics.ts`）1 箇所で、
そこで**幅は二重に縛られ、高さは一度も縛られていない**。

| 軸 | 何が縛っているか | 結果 |
| --- | --- | --- |
| 幅 | `GRID_COLUMN_CAP = 5`（7±2 由来）と `MAX_LAYER_WIDTH`（1200 / icon 1040）の早い方 | 有界 |
| 高さ | なし。層内 wrap も層の積み上げも `layerBaselineY` を下へ進めるだけ | 単調増加 |

さらに、出来上がったバウンディングボックスを読み返す経路がパイプラインに 1 つも無い。
`MAX_LAYER_WIDTH` は定数なので、カードがわずかに太いだけで 1 行 3 枚が入らず 2 枚に折り返され、
以降はひたすら下に伸びる（`service/ApiBackend` の 18 ドメインが 2 列 × 9 行になるのがこれ）。

deploy 側にはもう 1 つ独立の欠落がある。ADR-1737 が grid 化したのは deploy の**コンテナ**で、
コンテナ**の中の unit** は 1 列に積んだままだった。dify の `VectorStore` は互換のベクタ DB
イメージを十数個 realize するため `380 × 2094`（カード 1 枚幅 × 十数枚高）になり、それが行の
高さを決めて以降のレイヤーを全部下へ押し出す。deploy キャンバスの空白の主因はこれ。

## 制約・前提

- **決定性は譲れない**。同じ入力 → 同じ SVG、差分は局所的、という `docs/concepts.md` Goals の
  基盤特性を壊さない。乱数・焼きなまし・収束ループは採らない。
- **viewport に依存しない**。CLI は headless でレンダリングするので、目標値は定数か style hint
  でなければならない。実際のウィンドウ幅を読む解は不可。
- **既存出力をむやみに動かさない**。現行定数を候補の先頭に置き、厳密に良いときだけ置き換える。
- **non-goal との線引き**。`docs/concepts.md` の「No fully-automatic layout optimization」
  （escape hatch は [ADR-649](../adr/649-drawio-export.md) の draw.io export）に対し、
  ADR-1737 は「決定的で数ベースの既定レイアウト規則は抵触しない」と線を引いた。本件は
  **測定ジオメトリ（累積幅・高さ）を配置判断にフィードバックする**ので線が一歩動く。昇格 ADR で
  新しい線の位置を記録する。
- **[ADR-1000](../adr/1000-icon-mode-layout-gap-tuning.md) 案2 を再導入しない**。同 ADR は
  「tier ベースを捨てて icon mode を密グリッドパッキングにする」別戦略を、(a) 新コードパスが
  増えて routing の恩恵を再実装するか片肺になる、(b) mode 切替で配置が大きく変わり差分が
  読みづらい、という理由で却下している。本件はパッキング規則を変えず、共有 choke point で
  行幅予算の選び方だけを変えるので (a) に抵触しない。(b) には、探索の下限を各表示モード自身の
  定数（shape 1200 / icon 1040）にすることで応える。
- **[ADR-2521](../adr/2521-multi-system-pipeline-convergence.md) に従い、共有ヘルパーに
  「キャンバス寸法の両対応フラグ」を足さない**。行幅予算は探索が内部で渡す引数に留め、
  `CompileOptions` などの公開 API には出さない（spike では A/B 用に一時的に通したが、本実装では
  持ち込まない。before/after は main のチェックアウトから採る）。
- 深い連鎖（1 ノードだけの層が縦に連なる形）は **out of scope**。行を広げても吸収するものが無く、
  #2593 の案 B / C（レイヤー列の折り畳み）が要る。
- レイヤー帯をまたぐ 2 次元パッキングも **out of scope**。依存 DAG の「1 レイヤー = 1 行」という
  読み方を変えるため、別の意思決定になる。

## 検討した選択肢

配置演算は純関数なので、候補となる行幅予算のリストで配置をやり直し、最良の回を採る、という
枠組みは共通。**違うのは「最良」の定義**である。

### 案1: 目標アスペクト比に最も近い候補を採る

比率が 1（正方形）に log 距離で最も近いキャンバスを選ぶ。

**メリット**

- 縦長リボンは確実に解消する。目的が 1 つで説明しやすい。

**デメリット**

- **空き空間がほとんど減らない**。41 view のキャンバス面積合計で −2%。
- 正方形に寄せるために面積が増える場合がある。deploy view で比率 0.98 の候補は、
  比率 0.75 の候補より 18% 大きい。読者が見るのは比率ではなく空白なので、目的がずれている。

### 案2: 面積が最小の候補を採る

中身の面積は候補によらず一定なので、面積最小 = 空き最小。

**メリット**

- 空き空間に直接効く。40 view の面積合計で −27%。

**デメリット**

- **棚詰めは横長ほど得をする**ため、比率 8〜9 倍のリボンが選ばれる view が出る
  （`IdentityAccess` 8.22、`Conversation` 9.61、`Agent` 9.42）。縦長を直して横長を作る。

### 案3: 帯に収まる候補のうち面積最小（採用）

比率を**目的ではなく制約**にする。縦 16:9 から横 16:9 までの帯に入る候補だけを対象とし、
その中で面積が最小のものを採る。帯は log 空間で対称なので縦横どちらも贔屓しない。
帯に入る候補が 1 つも無ければ、最も正方形に近いものにフォールバックする。

**メリット**

- 面積 −20%（40 view、予算固定比較）を得つつ、全 view が帯の内側に収まる。
- 「画面に収まる形の中で一番小さく描く」という一文で説明できる。

**デメリット**

- 定数が 1 つ増える（帯の上下限）。ただし 16:9 は画面形状という外形的な根拠を持つ。

### 案4: 衝突を見てノードを動かし、収束するまで繰り返す

配置 → 配線 → 衝突があればノードを調整 → 再配線、を衝突が無くなるまで反復する。

**デメリット**

- **収束保証が無い**。停止条件を「衝突ゼロ」にすると止まらないモデルが必ず出るし、
  回数上限を付けると結果が上限に依存する（入力の小さな差が大きな差になる）。
- エッジ 1 本の追加でレイアウト全体が組み替わり、差分の局所性を壊す。compare / diff モードに
  直接効く。決定性の制約と相性が悪い。

### 案5: 面積から閉形式で予算を求める

`予算 = sqrt(総面積 × 目標比 / 充填率)` を一度だけ計算する。

**デメリット**

- 充填率を定数で仮定することになるが、実測では 0.63〜0.85 とばらつく。外すと過大にも過小にも
  なり、しかも外したことに気づけない。候補を実際に配置して測れば仮定が要らない。

## 比較

dify モデルで、同一ツリー・予算を固定して測った（40 view の合計）。

| 観点 | 案1 目標アスペクト | 案2 面積最小 | 案3 帯 + 面積最小 |
| --- | --- | --- | --- |
| キャンバス面積合計 | 155.0 Mpx（−2%） | 115.8 Mpx（−27%） | 126.3 Mpx（−20%） |
| 縦長（< 0.75）の view | 0 | 1 | 1 |
| 帯（9:16〜16:9）から外れる view | 0 | 7 | 0 |
| 説明のしやすさ | 目的が 1 つ | 目的が 1 つ | 目的 1 + 制約 1 |

deploy view の候補を並べると差がはっきりする（実装後の値）。

| 行幅予算 | キャンバス | 比率 | 面積 | ノード占有率 |
| --- | --- | --- | --- | --- |
| 1200（現行定数 = 下限） | 1296 × 2180 | 0.59 | 2.83 Mpx | 30.4% |
| 1412 | 1419 × 1892 | 0.75 | **2.68 Mpx** | **32.0%** |
| 1662 | 1755 × 1792 | 0.98 | 3.15 Mpx | 27.3% |

## Related TPLs

- [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md) — 単一ビューの解像度を
  一目で把握できる範囲に保つ。本設計が奉仕している観点そのもの。
- [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) — 並列関数のパリティ。
  単一 system / 複数 system / drill-down / deploy が同じ規則を共有すること。#1737 の根本原因が
  これで、同じ形を繰り返さないために choke point で解く。
- [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md) — 表示モード切替の
  precedence。icon / shape で下限定数が異なるため、両モードで確認する（ADR-1000 の懸念）。
- [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)
  — 再配置は全要素をちょうど一度置く。候補ごとに配置をやり直すので、破棄した回の副作用が
  残らないこと（純粋性）が要件になる。
- [TPL-1790](../test-perspectives/TPL-1790-root-svg-viewbox-responsive.md) — root SVG の
  viewBox。キャンバス寸法が変わるので、束ね描画側の viewBox が追随すること。
- [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md) —
  衝突が無い図は byte-stable に保つ。本設計の「下限候補が勝つ入力では出力が 1 バイトも
  変わらない」性質と同じ要求。
- [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)
  （proactive、本 PR で起票）— レイアウトに測定値のフィードバックを入れるときの観点。既存 TPL に
  「探索の候補列は入力のみに依存し、既定候補を先頭に置き、厳密改善のみで置き換える」を
  求めるものが無く、パイプラインに初めてフィードバックを導入する本件で 3-Yes を満たすため。

## 現時点の方針

**案3 を採用する。** 読者が見ているのは比率ではなく空白であり、面積は空白の直接の代理変数で、
中身の面積が候補によらず一定である以上「面積最小 = 空き最小」が厳密に成り立つ。比率は
「読める形」を担保する制約として最小限だけ効かせる。

加えて **ADR-1737 の balanced grid を deploy コンテナ内の unit にも適用する**。これは目的関数の
議論とは独立の欠落（同 ADR がコンテナで止まっていた）で、deploy キャンバスの空白の主因が
そこにあると実測されたため、同じ決定に含める。

### 実装の指針

1. `packages/core/src/renderer/aspect-search.ts`（新規）
   - `candidateWidthBudgets(floor)` — 下限から幾何級数で 12 段。折り返し判定はスケールフリーなので
     等比が妥当。整数に丸めて重複を除き、プラットフォーム間で安定させる。
   - `withinAspectBand(w, h)` / `squareness(w, h)` — 帯の判定と、同面積のときの tiebreak。
   - `searchWidthBudget(place, size, { floor })` — 候補を昇順に評価し、帯の内側で面積最小を採る。
     同点は先（小さい予算）を残す。帯の上端を超えたら打ち切る（予算を広げると幅は減らず高さは
     増えないので、以降は外れる一方）。帯に入る候補が無ければ最も正方形に近いものを返す。
     0 × 0 の退化キャンバス（空ビュー）でも結果を返すこと。
   - `relaxedColumnCap(base, budget, floor)` — 予算を広げたぶんだけ列キャップを緩める。
     `gridColumnCount` の `ceil(sqrt(n))` は据え置きなので、実際に効くのは `cap²` を超える層だけ。
2. `layer-layout-logics.ts` — `wrapLayerIntoRows` に渡す幅と列キャップを予算から取る。
   `grid-columns` の著者指定は従来どおり最優先。
3. `layout.ts` — `layout()` が探索を回す。**採点は最終キャンバス**（`width` / `height`）で行う。
   外部ノードの側面カラムやコンテナ余白はレイヤー content box の外側にあり、content box で
   採点すると横に行き過ぎる（root view が 1.16 → 2.28 に悪化する）。`layoutMultipleSystems` は
   `layoutInner` 経由で同じ探索の下に入る。
4. `deploy-layout.ts` — `layoutContainerUnits` を切り出し、コンテナ内 unit を
   `gridColumnCount` + `wrapLayerIntoRows` で畳む。コンテナの寸法測定と unit の配置が同じ
   グリッドを見ること（測定と配置の二重計算を作らない）。`layoutDeploy` は同じ探索で包む。
5. テスト
   - `aspect-search.test.ts` — 候補列の決定性・帯の対称性・「同面積なら小さい予算」・
     「帯に入るものが無いときのフォールバック」・退化キャンバス。
   - `layout.test.ts` — 縦長入力が帯に入ること、横長入力の座標が下限固定時と完全一致すること
     （byte-stable）、決定性、深い連鎖は変わらないこと（out of scope の明示）。
   - deploy — unit が 1 列にならないこと、コンテナ寸法が grid と一致すること。
6. AT: `docs/acceptance/2593-canvas-space-objective.md`。TC は:
   - app で deploy view を開き、空白が減って全体が画面に収まること
   - 既存 examples の system view が変化しないこと（下限が勝つケース）
   - icon mode で表示が破綻しないこと（ADR-1000 の (b) に対する実機確認）
   - CLI `karasu render` と app と VS Code で同じ座標になること
7. changeset を追加する（`pnpm changeset status --since=main`）。
8. ADR 昇格: 実装完了後 `docs/adr/2593-canvas-space-objective.md` として昇格し、本 Design Doc は
   同 PR で削除する。ADR には non-goal 境界の新しい位置（測定ジオメトリのフィードバック）を
   ADR-1737 の記述と並べて書く。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 縦長だった図の座標が変わる。横長・正方形の図は 1 バイトも変わらない
  （下限候補が勝つ）。`.krs` の記法・診断・API は変更しない。
- ドキュメント更新: `docs/spec/style.md` の `grid-columns` 節に「既定は帯の内側で面積最小に
  なる行幅を選ぶ」旨を追記（著者指定が最優先である点は変えない）。`docs/concepts.md` の
  scoped glance / 解像度の軸は既に本設計の根拠を述べているので追記は不要。
- テスト・examples への影響: spike では core 3886 / cli 347 / app 1343 が green で、
  スナップショットの書き換えはゼロだった。既存フィクスチャは下限が勝つ規模のため。
