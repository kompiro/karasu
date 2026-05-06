# Edge `direction: left` / `direction: right` in the layered layout

- **日付**: 2026-05-06
- **ステータス**: 検討中
- **関連 Issue**: [#1135](https://github.com/kompiro/karasu/issues/1135)（親 #1124 / #1076）
- **関連設計**:
  - [`docs/design/edge-direction-style.md`](./edge-direction-style.md)（5 値 enum の元設計）
  - [`docs/design/gui-driven-style-editing.md`](./gui-driven-style-editing.md)（GUI 編集器が `.krs.style` を append する文脈）
- **既存仕様**: `docs/spec/style.md`（`column` ノードヒント、`direction` プロパティ）
- **既存実装**:
  - `packages/core/src/renderer/layer-layout-logics.ts`（`sortByBarycenter`、`bucketByColumn`）
  - `packages/core/src/renderer/layout.ts`（forced layer / 多 system view から呼ばれる）
- **関連 ADR**:
  - [ADR-20260409-04](../adr/20260409-04-barycenter-layer-ordering.md): 同 layer 内の barycenter による x 順序（baseline）
  - [ADR-20260429-04](../adr/20260429-04-style-column-layout-hint.md): node `column` hint の escape hatch。本設計はこの上に **edge 側の override 層** を追加する位置付け
  - [ADR-20260430-04](../adr/20260430-04-resource-rw-edges.md): **last-wins** を CSS カスケード整合の project-wide 慣習として採用 — 本設計の last-wins ルールはこれに従う

## 背景・課題

`direction` プロパティの 5 値 enum のうち、`up` と `down` は #1132 / #1136 で
layered layout に反映済み。残った `left` / `right` は parse / resolve は通る
ものの、**`auto` にフォールバック**して描画に効かない状態。

`up` / `down` は **層間（縦方向）** の関係を表すので layer 反転で素直に
実装できた。`left` / `right` は **層内（横方向）** の関係なので、設計判断が
別にいくつか必要:

1. source / target を **同一層に引き寄せる** か、それとも **既に同一層に
   いる場合のみ** バイアスを掛けるか
2. 既存の **node 側 `column` ヒント** との優先順位
3. 同一ノードに対する複数の矛盾するヒントの解決方法
4. forced kind-based 段組（top-level system view）と drill-down の挙動の
   違い

## 制約・前提

- **既存挙動を壊さない**: 現状の column hint・barycenter sort・forced
  kind-based layout は触らない
- **`up` / `down` のメンタルモデルとの一貫性**: source 側のみ局所的に
  動かす（target はそのまま）
- **GUI 編集器（#1098 / #1129）から書き出された rule が即座に効く**こと
- **MVP として実装可能な粒度**に絞る

## 検討した選択肢

### 案A: 同一層引き寄せ（強い意味、採用）

source / target が異なる層にあるとき、source を target の層に **引っ張ってきて**
横並びにする。

- 利点:
  - ユーザー意図に直感的に応える。`A -> B direction: right` と書けば
    service 同士のエッジなど典型ケースで必ず横並びになる
  - `up` / `down` が既に「source の layer を per-edge で修正する」介入を
    行っているので、karasu 全体として一貫した「source 局所変位」モデルに
    収まる
- 欠点:
  - kind 段組を局所的に崩すが、影響は明示されたエッジの source endpoint
    のみ（target と他の同種ノードは動かない）
  - 引き寄せが連鎖し得るが、`up` / `down` で既に同様の連鎖が実装されており
    観察上は素直に振る舞う

→ **採用**。`up` / `down` と同じ「source の layer を target に合わせて
　 修正」セマンティクスで実装する

### 案B: 同一層内バイアスのみ（弱い意味、初版採用→撤回）

source / target が **既に同一層にいる場合に限り**、source を target の
左側 / 右側に並べる。異なる層なら no-op（auto 扱い）。

- 利点:
  - layer 割当を変えないので副作用が小さい
- 欠点:
  - 別層にいるとき no-op になる。`service A -> service C` のような
    典型ケースは forced 段組内の topological sub-sort で別 sub-layer に
    分かれるため、ユーザーが GUI で `direction: right` を指定しても
    "効かない" 状態になる（実装中に確認）
  - `up` / `down` の "source 局所変位" モデルと整合しない（横方向だけ
    no-op になる）

→ 初版で採用したが、実装直後の動作確認で `service A -> service C` を含む
　 典型ケースで効かないことが判明。案 A に切り替え（PR #1139 内で対応）

### 案C: 案 B + 別層なら警告

挙動は案 B と同じだが、別層に対して `direction: left/right` を書いたら
warning を出す。

- 利点: ユーザーがミスに気付ける
- 欠点: 「将来同一層になるかもしれない（例えば layer ヒューリスティクスが
  変わる）から書いておく」というケースに warning が邪魔
- 判定: 案 B のみで進め、warning は将来必要なら追加（YAGNI）

→ 不採用

## `column` ヒントとの優先順位

エッジ `direction: left/right` は **二項関係**（source と target の相対位置）
を指定する。一方ノード `column: left | center | right` は **絶対位置**
（layer 内の 3 つのバケットの 1 つ）を指定する。

衝突例:
- ノード A に `column: right`、エッジ A -> B に `direction: left`（A が B の左に）
- B が `column: center` の場合、A は中央バケット相当の位置にいることになり、
  ノード hint と矛盾

**ルール**: per-edge `direction: left/right` が **source endpoint について**
node `column` を上書きする。

理由:
- per-edge は二項関係でより具体的
- ユーザーが GUI で edge を直接選んで指定したヒントなので、意図がより
  ピンポイント
- `column` hint は「クラス / kind 単位の層内バケット」を狙うグローバル
  指定。`direction` は「特定エッジの両端の関係」を狙う局所指定

target endpoint の `column` は引き続き尊重する（変更しない）。

spec に precedence ルールを明記する。

### ADR-20260429-04 との関係

ADR-20260429-04 は「各バケット内では既存の並び（system view では宣言順、
それ以外では barycenter）を保持」と書いている。本設計で source を target
の右 / 左に並び替える際、結果として **bucket 境界を越える可能性がある**。

これは ADR を覆すものではなく、**新しい上位 override 層を 1 段加える**
扱い:

| 層 | 役割 | ADR |
|---|---|---|
| 1. layer 割当 | y 軸（kind tier または topology） | 既存 |
| 2. barycenter sort | bucket 内 x の baseline | ADR-20260409-04 |
| 3. `bucketByColumn` | node 単位の bucket 振り分け | ADR-20260429-04 |
| 4. **`applyEdgeDirectionWithinLayer`**（本設計） | edge の二項 hint で source の最終位置を決定 | 本設計 |

各層は **下から上へ override 関係**で、edge hint が来たときだけ層 4 が
発火する。column hint しかなければ層 4 は no-op で ADR-20260429-04 の
「bucket 内並び保持」が引き続き成立する。`direction` プロパティが
増えるのは GUI 編集器（#1076）という motivating example の登場による
もので、ADR-20260429-04 の「rank/row は motivating example が出てから
個別検討」という方針にも整合する。

## 矛盾するヒントの解決

同一ノードを source とする複数のエッジで矛盾する `left/right` を書いた場合:

```
A -> B { direction: right }  /* A は B の右 */
A -> C { direction: left  }  /* A は C の左 */
```

この 2 本は両立可能なケースもある（C が B の右にいて、A はその間にいる）が、
両立不能なケースもある（B = C, または C が B の左にいる）。

**ルール**: **declaration 順で後勝ち（last-wins）**。プロジェクト全体の
慣習に揃える:

- カスケードレベル: GUI が `.krs.style` に append する設計（#1076）なので
  resolved style 自体が常に **後勝ち** で確定する
- ADR-20260430-04 が「**last-wins** は CSS カスケードと整合し、authors が
  後の宣言で前の classification を上書きできる（一貫性のある編集体験）」
  として last-wins を **project-wide 慣習** として正式採用
- `up` / `down` の forced layer 適用も last-wins（#1132 で確立）
- 著者にとって「最後に操作した GUI 入力 / 最後に書いた rule が反映される」
  という直感が一貫する。`left/right` だけ先勝ちにすると、GUI で操作した
  はずなのに反映されないケースが出てユーザーを混乱させる

具体的な処理:

1. declaration 順に edge を走査
2. `right`: source を target の **直後**（target の右）に並び替える
3. `left`: source を target の **直前**（target の左）に並び替える
4. 後発のヒントが先発の配置を上書きするのは仕様上当然（last-wins）

矛盾検出時の挙動: warning を出さずに silent に上書き。`up` / `down` と一貫。

## 適用スコープ

`bucketByColumn` が呼ばれる経路だけで効かせる:

- ✅ **forced kind-based system view（top-level）**: column hint が既に効く
  経路。`direction: left/right` も同経路でフックする
- ✅ **多 system view**: 同上
- ⚠️ **drill-down view（service / domain）**: 現状 column hint が効かない
  ため、`direction: left/right` も同様に効かない（auto 扱い）。spec に
  明記。将来 drill-down で column を honor する別 issue が立てば、そこに
  乗せる
- ❌ **deploy / org view**: 現状 column hint が無視され warning が出る。
  `direction: left/right` も同様に無視。warning は出さない（edge プロパティ
  なので column hint warning とは別）

## 現時点の方針

**案 A + edge hint が source endpoint の column 指定を上書き** を採用。

### アルゴリズム概要

1. layer 割当（forced kind-based または topological）後、**`applyDirectionHintsToForcedLayers`** を全エッジに対して走らせる:
   - `up`: source.layer = target.layer + 1（既存実装）
   - `down`: source.layer = target.layer - 1（既存実装、target が layer 0 のときは no-op）
   - **`left` / `right`: source.layer = target.layer**（本設計の追加分。元から同一層なら no-op）
2. 各 layer 内で `bucketByColumn` を実行（既存）
3. その後段に新パス **`applyEdgeDirectionWithinLayer`** を追加。同一層に
   landed した source / target に対して:
   - `right`: source を target の **直後** に並び替える
   - `left`: source を target の **直前** に並び替える
   - 後発ヒントが先発の配置を上書きしてもそのまま適用（last-wins）

`up` / `down` と同じ「per-edge で source を target の周辺に局所変位させる」
モデル。target と他のノードは動かない。

### 影響範囲

- node `column` ヒントは引き続き bucket 分けに使われる。edge ヒントは
  source endpoint について bucket 配置を上書きする
- forced kind-based layout で他の同種ノードは元の位置に残るので、kind
  stratification への影響は明示されたエッジの source endpoint のみ
- topological 経路でも同じ機構が動く（drill-down view でも honor される）

### Spec / コード変更

| 場所 | 変更 |
|---|---|
| `packages/core/src/renderer/layer-layout-logics.ts` | 新関数 `applyEdgeDirectionWithinLayer(orderedIds, edges, edgeDirections, layerOf)` を追加 |
| `packages/core/src/renderer/layout.ts` | `applyDirectionHintsToForcedLayers` を `left`/`right` も扱うよう拡張、layer 計算後 forced/topological 両経路で実行。`bucketByColumn` の後段で `applyEdgeDirectionWithinLayer` を呼ぶ |
| `docs/spec/style.md`、`style.ja.md` | `direction: left/right` の挙動と `column` precedence を明記 |
| `docs/acceptance/1135-edge-direction-horizontal.md` | AT |

## アクセプタンステスト観点

- AT-A: 同一 layer の sibling 2 ノード間の edge に `direction: right` を付けると、source が target の右側に並ぶ（barycenter / column が違う結果を出していたとしても上書きする）
- AT-B: `direction: left` で対称
- AT-C: source / target が異なる layer にいるとき、`direction: left/right` は no-op（auto 扱い）
- AT-D: ノード A に `column: right` を、エッジ A -> B に `direction: left` を付けたとき、A は B の左に並ぶ（edge hint が node hint を上書き）
- AT-E: 同じソースに対する複数の矛盾する `left/right` ヒントは declaration 順で **後勝ち**（プロジェクトの cascade / forced-layer last-wins ルールと一貫）
- AT-F: end-to-end で `compile()` が direction:left/right を SVG x 座標に反映する

## 未解決の問い

なし。以下は実装着手時に判断する詳細:

- 並び替え時のバケット境界をどう扱うか（左バケット内のノードを右バケットに
  入れるべきか、バケット境界は維持すべきか） → MVP では「同 layer の
  順序リスト全体に対して並び替え」に統一し、バケット境界は維持しない。
  edge hint は column hint より優先するという precedence ルールに整合
- forced kind-based layout で source / target が異なる kind tier に属する
  場合 → 同 layer に居ないので no-op（spec に明記する）
- drill-down view で `direction: left/right` を honor する将来拡張 →
  別 issue として残す（barycenter と組み合わせる必要があり別設計）
