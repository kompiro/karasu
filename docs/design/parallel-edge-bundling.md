# 同一ペア間の並列エッジ束ね（parallel edge bundling）

- **日付**: 2026-05-09
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1185](https://github.com/kompiro/karasu/issues/1185)
  - 親 brainstorm: [#1071](https://github.com/kompiro/karasu/issues/1071)（Direction C — エッジルーティング改善）
  - 兄弟 ADR: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（直交チャネルルーティング）
  - 既存実装:
    - `packages/core/src/renderer/edge-routing-ports.ts`（同一サイドのポート分散）
    - `packages/core/src/renderer/edge-routing-channels.ts`（skip-layer L 字）
    - `packages/core/src/renderer/edge-routing-lanes.ts`（チャネル内レーン分散）
    - `packages/core/src/renderer/edge-routing.ts`（描画とラベルアンカー）

## 背景・課題

karasu は同一ペア `(A, B)` の間に複数のエッジを書ける:

```krs
A -> B "create"
A -> B "update"
A --> B   // 非同期
```

これらは独立した `LayoutEdge` として扱われるが、視覚上は次のような問題が出る。

### 1. ラベルが重なる

`distributePorts` は同一ノードサイドに 2 本以上のアンカーが集まると `i/(N+1)` で分散する。
`A -> B` 並列 2 本のケースでは

- A の bottom side で 2 本 → ポートは A.bottom × {1/3, 2/3}
- B の top side で 2 本 → 同様に {1/3, 2/3}
- ソート（opposite endpoint の x で）により、leftmost-to-leftmost / rightmost-to-rightmost に対応付く

結果としてエッジ「線」自体は幅 1/3 ノード幅（service の場合 ≈ 60px）程度ずれる。
しかし **ラベル** は各エッジの polyline 中点に anchor されるため、

- 両エッジの中点 y は同じ（A.bottom と B.top の中央）
- 中点 x は (port_from.x + port_to.x) / 2 → 2 本でちょうど ノード中心 ± W/6 ≈ ±30px

ラベル幅が "create" / "update" 程度でも 50px 級になりうるので、`±30px` のずれでは
ラベル矩形が重なるケースがある。日本語ラベル（"作成" / "更新"）でも同様。

### 2. 同期 + 非同期（`A -> B` + `A --> B`）

stroke style (solid / dashed) で kind は区別されるが、`distributePorts` は kind を見ないので
両方とも同じ A.bottom グループに入り、t = {1/3, 2/3} に分かれる。
これは「両方の線が描かれる」点では正しいが、利用者は

- 「同じセマンティクスのエッジを 2 本書いてしまった」
- 「sync と async を区別したい」

という別の意図を持つことがあり、ラベル衝突に加えて
**stroke だけでは違いに気付きにくい**ケースがある。

### 3. ghost / cyclic エッジ

`distributePorts` は `edge.ghost || edge.cyclic` を skip するため、
ghost や cyclic で並列が発生したケースは現状アンカーが完全に重なる。
これらは件数が少ないが、ad-hoc な合成（usecase → resource）で
parallel が出るシーンでは問題になる。

### 4. 「エッジが束ねられている」という意図表現の欠如

複数本の並列エッジは、レンダラ視点では単に「N 本の独立したエッジ」だが、
利用者視点ではしばしば **1 本の関係を 2 ラベルで装飾している** ことを意図する
（例: REST API で `POST /users` と `PUT /users/:id` の両方を 1 ペアにまとめたい）。
レンダラが束ねの存在を「描画の都合」だけで隠してしまうのは情報の損失。

## ゴール

[#1185](https://github.com/kompiro/karasu/issues/1185) の Definition of done に従う:

- `A -> B "create"` と `A -> B "update"` の図で、両エッジ・両ラベル・両矢印が
  視覚的に分離して見える
- 既存の単一エッジケース（`A -> B` 1 本）は無変更
- 直交チャネルルーティング（ADR-20260429-01）と composable
- 決定論的（snapshot test と整合）

## スコープ外

- 別ペアのエッジを 1 本の太い「トランク」に束ねる graph drawing 技法（#1071 directions C 親 issue でも explicit にスコープ外）
- 並列を 1 本＋カウントバッジに集約（#1071 direction E — 別ブレストへ）
- ラベル位置のオーサ制御（#1071 direction A — 別ブレスト/別 issue）

## 検討した案

### 案 1: ラベルの中点を辺に沿ってずらす（label slide）

ラベルを単に「polyline の長辺中央」ではなく `t = (i + 0.5) / N` の位置に置く。

**Pros**
- 線の経路は変えなくていい。差分が最小。
- ラベル衝突は確実に解消する（衝突しない位置に置けるため）。

**Cons**
- 「N 本のエッジを認識する」ロジックが必要。エッジ単体には情報がないので、
  bundling pass で `bundleIndex / bundleSize` を `LayoutEdge` に書き戻す必要あり。
- ラベルが端寄りに行くと、矢印頭（marker-end）と重なることがある。
- ラベルが「線の上」に乗るケースが生じる（slide した先がノード境界に近いと特に）。
  `labelAnchor` が「最長セグメント」を選ぶ現行ロジックと干渉する。

### 案 2: 線そのものを片側 / 両側へ ±delta 平行移動（line offset）

エッジの from-port と to-port を perpendicular にずらして、線同士を物理的に分離する。
今の `distributePorts` の延長線上にある発想だが、

- `distributePorts` は **ノードサイドを共有する全エッジ** をまとめて分散する
- bundling は **同一 (from, to) ペアのエッジ集合** を分散する

**Pros**
- 線が物理的に分離するので、ラベル衝突も自動的に緩和される
  （エッジ中点がそれぞれ別の y / x になる）。
- 直交ルーティングと自然に合成できる（waypoints が複数生成されても、
  port が違えば L 字も別々の通り道を通る）。
- 既存 `distributePorts` の構造（`groups` を Map で持って `i/(N+1)` で分散）
  を再利用できる。

**Cons**
- 「同一ペア間で N 本」が常に発生するとは限らない。`distributePorts` が
  「サイド共有」を見ているのに対して、bundling は「ペア共有」を見るので
  両者を同時に走らせると、サイド分散とペア分散が入れ子になり port 計算が複雑化する。
- 並列 2 本＋他に出ている 3 本（合計 5 本が A.bottom に乗る）ケースで、
  どの順で割り振るかの設計が必要。

### 案 3: ラベル＋線の両方をシフト（hybrid）

`distributePorts` の前に bundling pass を入れて、同一ペアのエッジを
**先に違う port にずらしてしまう** 方法。`distributePorts` 本体は
「サイド単位での均等分散」をそのまま続ける。

- bundling pass は per-pair で `from` 側に小さな perpendicular offset
  （±BUNDLE_GAP / 2）を与える。`distributePorts` がそれを上書きするのを避けるため、
  bundling 結果の anchor は **side ではなく自由位置** にする
  （`detectSide` で side が検出できなくなり、`distributePorts` の対象外になる）。

**Pros**
- `distributePorts` を変更せずに済む。
- 並列でない通常エッジは何も変わらない（pass が no-op）。

**Cons**
- "side でない anchor" を導入するのは大きな抽象変更。`distributePorts` の
  「サイドに整列していれば均等分散する」という不変条件が壊れる。
- 直交ルーティングは port が node の bbox 上にあることを前提にしているので、
  side から外した anchor は L 字計算で破綻する可能性がある（L 字の出発 stub 方向が
  曖昧になる）。

### 案 4: 並列を「単一の論理エッジ + 複数ラベル」に集約

renderer 側で `(from, to)` を key にエッジを 1 本に統合し、
ラベルを並べて表示する（"create / update" を縦積み等）。

**Pros**
- 視覚的にも「同じ関係の付加情報が複数ある」と読み取れる。
- 矢印は 1 本に減るので blast 半径が小さい。

**Cons**
- 現行の "edge id selector"（ADR-20260506-02）や "edge direction style"
  （ADR-20260506-03）が **edge 単位** で動くので、論理統合すると
  選択肢の identity が壊れる。
- diff renderer (`paste-compare` / `bundled-all-views-diff`) が edge 単位で
  before/after を比較しているため、識別子が変わると diff 表示が壊れる。
- そもそも issue で out-of-scope と明示されている direction E。

## 決定（案）

**採用: 案 2（line offset）を `distributePorts` の前段として追加する。**

具体的には:

1. **新規パス `bundleParallelEdges`** を `packages/core/src/renderer/edge-routing-bundles.ts` に追加する
2. **グルーピング鍵: `(from, to)` のみ** とする — kind（sync/async）は分けない
   - 理由: 視覚的衝突は kind を問わず発生する。kind は stroke style で別途区別される
   - 注: `(from, to)` は **無向ペア** ではなく **有向ペア**。`A -> B` と `B -> A` は
     異なるグループとして扱う（互いに重なることはあっても、束ねの意味論が違う）
3. **対象**:
   - 同一 `(from, to)` のエッジが 2 本以上集まったグループのみ処理
   - ghost エッジ・cyclic エッジは scope 外（`distributePorts` と同じ方針）
4. **タイミング**: `distributePorts` の **前** に走らせる
   - bundling は port を「初期位置から perpendicular にずらす」
   - その後 `distributePorts` がサイド全体をまとめて再分散する
   - bundling の出力（少しずれた port）が `distributePorts` の sort tie-breaker として
     機能する：同一サイドに乗った並列エッジが、隣接 lane に詰まりやすくなる
5. **オフセット量**: グループサイズ N に対し、source 側 / target 側それぞれ
   `(i - (N - 1) / 2) * BUNDLE_GAP` を perpendicular に与える
   - `BUNDLE_GAP = 12px`（service node の幅 180px を超えない範囲で N ≈ 6 まで吸収）
   - perpendicular の方向は `to.center - from.center` のベクトルに対して 90° 回転
6. **割り振り順**: グループ内のエッジは **元の AST 出現順**（`viewSlice.edges` の index）で
   `i = 0..N-1`。決定論的でユーザの記述順に従う
7. **ラベル衝突の追加緩和**: 線が分離した後もラベル中点が近接する場合の対策として、
   `renderEdge` 側で並列エッジに **`bundleIndex / bundleSize` を渡し**、ラベル中点の
   along-edge 位置 `t` を `(bundleIndex + 1) / (bundleSize + 1)` に変える
   - これにより 2 本なら `t = 1/3, 2/3` でラベルがエッジに沿ってもずれる
   - `LayoutEdge` に optional フィールド `bundleIndex?: number; bundleSize?: number` を追加
8. **opt-in / 自動**: **常時自動**（opt-out なし）
   - 理由: `distributePorts` / `routeOrthogonalEdges` / `distributeChannelLanes` と同じ
     ポリシー — 衝突がなければ no-op、衝突があるときだけ視覚を改善する
   - 将来 style hint で抑止したくなった場合は後付け可能（fields を追加する後方互換変更）
9. **直交ルーティングとの合成**:
   - bundling は port を変えるだけで waypoints は触らない
   - `routeOrthogonalEdges` は変更後の port から L 字を作る → 並列エッジは別々の
     stub 出口を持つので L 字も別経路になる
   - `distributeChannelLanes` は同じ y 帯にいる L 字をさらに分散する → 並列が
     たまたま同じ channel に乗っても破綻しない

## アクセプタンステスト

人間確認が必要なもののみ（`docs/acceptance/` 配下に追加）。

- **AT (新規)**: `examples/parallel-edges.krs` を用意し、
  `A -> B "create"` と `A -> B "update"` を含む図で
  - エッジ線が視覚的に 2 本見える
  - ラベル "create" / "update" が **両方読める**（重なっていない）
  - 既存の `A -> B` 1 本のみの図と並べて、単一エッジ表示が変わっていないこと
- **AT (回帰)**: EC platform サンプル（`examples/ec-platform/index.krs`）の
  rendered SVG が、新パス導入後も意味的に変化しないこと
  （並列エッジが含まれる場合のみずれる）

## 単体テスト

- `edge-routing-bundles.test.ts`
  - 並列 N=2 で port が perpendicular に分散すること
  - N=1 では no-op
  - ghost / cyclic エッジはグルーピング対象外
  - `(from, to)` と `(to, from)` は別グループ
  - sync + async が混在しても 1 グループとして扱われる
- `edge-routing.test.ts`（または `svg-renderer.test.ts`）
  - `bundleIndex` / `bundleSize` が設定されたエッジのラベル位置が
    `t = (bundleIndex + 1) / (bundleSize + 1)` で計算されること

## ロールアウト

1. `bundleParallelEdges` パスを追加し、`layout()` 内で `distributePorts` の直前に呼ぶ
2. `LayoutEdge` に `bundleIndex` / `bundleSize` を追加（optional）
3. `renderEdge` のラベル anchor を bundle aware にする
4. snapshot test の更新（並列エッジを含む既存図のみ）
5. AT 追加 + ドキュメント反映（`docs/spec/syntax.md` に「並列エッジは自動で束ねられる」旨）
6. ADR 昇格（実装完了 PR で行う）

## 未解決事項

- `BUNDLE_GAP = 12px` の妥当性は実測で確認する。actor / service / domain で
  ノードサイズが異なるため、サイズ比例にすべきかは実装後に判定
- 並列 N が極端に多い（N ≥ 6）ケースの上限。`LANE_BAND` のように cap を入れるかは
  実装後に follow-up
