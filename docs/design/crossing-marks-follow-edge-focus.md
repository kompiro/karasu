# 交差マーク（ホップ・junction chip・trunk band）をエッジの減光に追随させる

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3090](https://github.com/kompiro/karasu/issues/3090)
  - 関連 ADR: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（交差マークの導入。ホップは host エッジの線の隙間を弧で橋渡しする）、[ADR-2631](../adr/2631-trunk-legibility-by-count.md)（band と junction chip の数）、[ADR-3022](../adr/3022-edge-label-disclosure.md)（node focus の減光）
  - 関連設計: [hop-path-grouping.md](hop-path-grouping.md)（#2956。案3 を「#2632 側で属性の形と一緒に決める」として見送った。本件がその判断を引き取る）、[edge-hover-affordance.md](edge-hover-affordance.md)（#2632。edge hover の発火条件を広げる予定）
  - 関連 TPL: [TPL-2956](../test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md)（描画順を保つ）、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)
  - spike: `spike/3090-mark-edge-tag-size`（core 側の試作と Dify での計測。マージしない）
  - コード: `packages/core/src/renderer/svg-renderer.ts`（`renderCrossingMarks` / `renderTrunkBands`）、`packages/core/src/renderer/crossing-marks.ts`、`packages/app/src/components/focus-canvas/node-focus.ts`、`packages/app/src/styles/components/preview.css`

## 背景・課題

カードに hover すると、そのノードに触れないエッジが 0.12 に沈む（#3031）。interactive なエッジに hover すると、ほかのエッジが 0.25 に沈む（#1186）。どちらの場合も、**交差ホップ（◠）、junction chip（`2` / `3` の丸）、trunk band は明るいまま残る**。

Dify の Knowledge ドメインのような密な図では、線は沈むのに数十個の弧が明るいまま残り、無関係なエッジの経路をなぞり続ける。焦点の効果が半分しか効かず、残った弧が焦点のノードに属しているように読める。

原因は 2 つある。

1. 減光の規則が `.krs-edge` しか選ばない。交差マークは `.krs-edge` の外の別レイヤ（`g.crossing-marks` と `g.trunk-bands`）に描かれる。
2. 交差マークがエッジの識別を持たない。さらに #2956 は、**別のエッジ**のホップでも stroke が同じで連続していれば 1 本の `<path>` にまとめるので、弧をエッジごとに見分ける手段が無い。

## 現状（インベントリ）

| 観点              | 現状                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ホップ            | `marks.hops` の順に、stroke（色と線幅）が同じ連続区間を 1 本の `<path>` にまとめる（#2956 の案2）。区切りのキーは `continuesHopRun` 1 箇所。`HopMark.edge` は host エッジの index（`LayoutResult.edges` の添字） |
| junction chip     | `<circle>` + `<text>` の 2 要素。`JunctionMark.edge` は合流する stub エッジ 1 本だけで、chip が表す `count` 本のエッジの一覧は持たない                                                                           |
| trunk band        | `<polyline>` 1 本。`TrunkBand.edge` は運ぶエッジのうち先頭の 1 本だけ（色を借りるため）。運ぶ全エッジは `carriedAt()` の結果として計算時にだけ存在する。透明度は `opacity="0.4"`（presentation 属性）            |
| エッジのグループ  | `<g class="krs-edge" data-edge-from data-edge-to …>`。描画上の index を持たない。ghost エッジは別グループに移るので、DOM 上の順番は `LayoutResult.edges` の順と一致しない                                        |
| node focus の減光 | `node-focus.ts` が `<style>` に `${scope} .krs-edge:not(<mine>){opacity:0.12 !important}` を書く。`<mine>` は `data-edge-from` / `data-edge-to` が焦点のノードに一致するもの                                     |
| edge hover の減光 | `preview.css` の `svg:has(.krs-edge--interactive:hover) .krs-edge:not(:hover){opacity:0.25 !important}`。CSS だけで完結している                                                                                  |
| focus canvas      | 独自の SVG を組み、交差マークを描かない。本件の対象外                                                                                                                                                            |
| VS Code webview   | `.krs-edge` の hover 規則を持たない（edge-hover-affordance.md）。本件の対象外                                                                                                                                    |

## 制約・前提

- **描画順を変えない**（TPL-2956）。交差マークは今のレイヤに残し、要素の順番も変えない。足すのは属性と、ホップの区切りだけ。
- **ホップは host エッジの一部として沈む。** ホップの弧は host エッジ（`hop.edge`）の線の隙間を橋渡ししているので、視覚的にはその線の一部である。
- **複数のエッジを運ぶ chip と band は、運ぶエッジのどれか 1 本が焦点なら明るいまま残す。** 焦点の経路の一部だからである（Issue の未解決の問いへの答え）。
- **交差マークを持たない図の出力を変えない。** 追加する属性は、マークが参照するエッジにだけ付ける。
- out of scope: facet overlay の減光（renderer 側で `FACET_DIM_OPACITY` のラッパーをエッジに掛けるが、マークは沈まない）、diff モードの `unchanged` の減光、VS Code webview の hover。いずれも同じ種類の取りこぼしだが、発火の仕組みが別なので、本件で付ける識別を使う後続 Issue に分ける。

## 検討した選択肢

### 識別の形

#### 案A: 描画上の index で結ぶ（採用）

エッジのグループに `data-edge-index="N"` を、交差マークに `data-edges="N M …"`（空白区切り）を付ける。N は `LayoutResult.edges` の添字で、`HopMark.edge` などがすでに持っている値をそのまま出す。1 枚の SVG の中でだけ通じればよく、描画をまたいで安定している必要は無い。

**メリット**

- エッジ 1 本を一意に指せる。同じ `(from, to)` の平行エッジも区別できる（edge hover に必要）。
- 値が短い。複数のエッジを運ぶ band / chip でも `~=` で 1 本ずつ照合できる。

**デメリット**

- エッジのグループにも属性が要る（マークが参照するエッジにだけ付けるので、Dify 全ビューで 1,474 個、+30.9KB）。

#### 案B: `data-edge-from` / `data-edge-to` を写す

ホップに host エッジと同じ `data-edge-from` / `data-edge-to` を付ける。

**メリット**

- node focus の規則は、既存の `<mine>` をそのまま交差マークにも当てるだけで済む。エッジ側の属性は要らない。

**デメリット**

- 平行エッジを区別できないので、edge hover で hover していない平行エッジのホップまで明るく残る。
- band / chip は複数のエッジを運ぶので、from / to をそれぞれ一覧にする必要がある。ノードの id は引用符付きの名前を許すので、空白区切りの一覧と `~=` で照合する形が安全に成り立つとは言えない。
- 値がノードのパスなので長い。

#### 案C: canonical id で結ぶ

`data-edge-canonical-id` を交差マークにも写す。

**デメリット**

- canonical id を持つのは interactive なエッジだけで、node focus が沈めたいエッジの多くは持たない。

### edge hover の減光をどこで書くか

#### 案1: node focus と同じ JS で `<style>` を書く（採用）

`node-focus.ts` の `mouseover` はすでにキャンバス上のすべての hover を受けている。今は `.krs-edge` の上ならカードの焦点を外すだけだが、そこで hover されたエッジが interactive なら、その `data-edge-index` を含まない交差マークを 0.25 に沈める規則を同じ `<style>` に書く。エッジ本体の減光は今の CSS のまま残す。

**メリット**

- node focus と同じ仕組みに乗る。SVG の DOM に触れないので、図の再挿入でも壊れない（AT-1186 AT-D）。
- 出力 SVG に hover の振る舞いを持ち込まない。

**デメリット**

- edge hover の減光が CSS（エッジ本体）と JS（交差マーク）の 2 箇所に分かれる。#2632 で発火条件を `.krs-edge--interactive` から広げるときは、両方を同時に変える必要がある。発火条件を 1 つの定数にまとめ、CSS 側のコメントから参照して取りこぼしを防ぐ。

#### 案2: CSS だけで書く

CSS は hover されたエッジの属性値を別の要素の属性と照合できない。照合するには、エッジ 1 本ごとに `svg:has([data-edge-index="3"]:hover) [data-edges~="3"]{…}` のような規則を出力 SVG の `<style>` に生成するしかない。

**デメリット**

- Dify 全ビューで規則が千個を超え、1 本あたり 80 バイト前後かかる（+100KB 超）。
- アプリの hover の振る舞いを静的出力に持ち込む。

### ホップの区切り

#### 案i: 同じ stroke かつ同じエッジの連続区間ごとに 1 本（#2956 の案3。採用）

`continuesHopRun` に「同じエッジ」を足し、まとめた `<path>` に `data-edges` を付ける。

#### 案ii: 今のまとめ方のまま、`<path>` に区間内の全エッジを付ける

**デメリット**

- 焦点のエッジのホップと無関係なエッジのホップが同じ `<path>` に入ると、まとめて明るく残る。症状が一部残る。

## 比較

計測は Dify モデルの全ビュー bundle（`karasu render /workspaces/dify/index.krs`、`main` の `81161406` 時点）。試作は `spike/3090-mark-edge-tag-size`。

| 内訳                                                | 増分                                         | 比率       |
| --------------------------------------------------- | -------------------------------------------- | ---------- |
| ホップをエッジでも区切る（`<path>` の頭の繰り返し） | +108KB                                       | +2.06%     |
| 交差マークの `data-edges`（4,031 個）               | +82.7KB                                      | +1.57%     |
| エッジのグループの `data-edge-index`（1,474 個）    | +30.9KB                                      | +0.59%     |
| band の `opacity` → `stroke-opacity`（482 個）      | +3.4KB                                       | +0.06%     |
| **合計**                                            | **5,253,801 → 5,479,086 バイト（+225,285）** | **+4.29%** |

- ホップの `<path>` は 757 → 2,585 個（SVG 全体の `<path>` は 5,230 → 7,058 個）。
- #2956 の設計が見積もった「案3 で約 +2%」は区切りの分だけで、識別の属性を足すと +4.3% になる。#2956 で減らした分（−25.6%）の 6 分の 1 程度を戻す。
- 表示時間は #2956 の計測で、最も密な `DifyDB` のビューが 23ms → 33ms（案3）。属性の分は再計測して PR に載せる。

## 現時点の方針

**識別は案A（描画上の index）、edge hover は案1（node focus と同じ JS）、ホップの区切りは案i（#2956 の案3）を採る。**

決め手は、edge hover でエッジ 1 本を一意に指せる形が index しか無いことである。from / to は平行エッジを区別できず、canonical id は node focus が沈めたいエッジの多くが持たない。出力の増分 +4.3% は、焦点の効果が半分しか効かない今の状態を直す代償として受け入れる。

### 減光の規則

- node focus: `<mine>` に一致するエッジのうち `data-edge-index` を持つものの index を集め、`${scope} [data-edges]:not(:is([data-edges~="3"],[data-edges~="7"]))` を 0.12 に沈める。index が 1 つも無ければ交差マークをすべて沈める。
- edge hover: hover された interactive なエッジの index を `I` として、`${scope} [data-edges]:not([data-edges~="I"])` を 0.25 に沈める。index を持たないエッジ（マークを持たない）なら交差マークをすべて沈める。
- 交差マークにもエッジと同じ `transition: opacity 0.15s ease` を付け、線と弧が同じ速さで沈むようにする。
- band の透明度を `opacity` から `stroke-opacity` に移す。CSS の `opacity` は presentation 属性の `opacity` を置き換えるので、そのままだと沈めたときに band が 0.4 から 0.12 に変わるだけで、線（1 → 0.12）ほど沈まない。`stroke-opacity` に移せば CSS の `opacity` と掛け合わされて 0.048 になる。fill の無い 1 本の polyline なので、見た目は変わらない。

### 実装の指針

1. core（`crossing-marks.ts` / `layout-types.ts`）: `JunctionMark` と `TrunkBand` に、運ぶ全エッジの index `edges: number[]` を足す。chip は `carriedAt()` の結果、band はその区間の `carried`（run の band は `entries`）。`edge`（色を借りる 1 本）はそのまま残す。
2. core（`svg-renderer.ts`）:
   - `continuesHopRun` に同じエッジの条件を足し、ホップの `<path>` に `data-edges="<host>"` を付ける。コメントの「案3 に切り替えるときは」を、切り替えた理由に書き換える。
   - junction chip の `<circle>` と `<text>` の両方、band の `<polyline>` に `data-edges` を付ける（レイヤの中に `<g>` を入れ子にしない。hop-path-grouping.md の制約）。
   - マークが参照するエッジのグループにだけ `data-edge-index` を付ける（`renderEdge` に引数を足す）。
   - band の `opacity` を `stroke-opacity` に移す。
3. app（`node-focus.ts`）: 上の「減光の規則」を実装する。edge hover の発火条件（今は `.krs-edge--interactive`）を定数にし、`preview.css` の規則のコメントからその定数を参照する（#2632 で広げるときの取りこぼしを防ぐ）。`preview.css` に交差マークの transition を足す。
4. テスト:
   - core: ホップのエッジが A, B, A（同じ stroke）だと 3 本に分かれ、それぞれの `data-edges` が host と一致する。stroke とエッジの両方が同じ連続区間は 1 本のまま。展開したサブパスの列は 1 個ずつ描いたときと一致する（TPL-2956 の既存テストを残す）。chip と band の `data-edges` が運ぶエッジの集合と一致する。マークを持たない図ではエッジに `data-edge-index` が付かない。
   - app（Vitest）: `attachNodeFocus` にマーク付きの SVG を与え、カードと interactive なエッジに `mouseover` を送り、書かれた規則が無関係なマークを選び、焦点のマークを選ばないことを確かめる。
   - app E2E: ホップを持つ grouped な example でカードに hover し、無関係なエッジのホップの computed opacity が 0.12、焦点のエッジのホップが 1 であることを確かめる。edge hover でも同様に 0.25 と 1。
5. 計測を PR に載せる: Dify 全ビューの出力サイズと `<path>` 数（本 Design Doc の表を実装で再計測）、`DifyDB` の表示時間。
6. changeset: SVG の出力が変わるので `@karasu-tools/core` と `karasu` を `patch`、app も `patch`（`.claude/rules/changesets.md` の cascade 表に従う）。
7. AT: `docs/acceptance/3090-crossing-marks-follow-edge-focus.md` を新規に作る。TC は:
   - ホップ・chip・band がそれぞれ `data-edges` を持ち、値が運ぶエッジと一致する（自動）
   - node focus で無関係なエッジだけのマークが 0.12 に沈み、焦点のエッジを含むマークは 1 のまま（自動、E2E）
   - edge hover で同様に 0.25 と 1（自動、E2E）
   - Dify の Knowledge ドメインでカードに hover し、無関係な弧が線と一緒に沈んで見える（手動）
8. TPL: retrospective TPL を起こす（3-Yes を満たす。facet overlay と diff モードに同じ取りこぼしがあり横展開しうる、エッジの外のレイヤに装飾を足すたびに構造的に再発しうる、既存 TPL に未掲載）。観点は「エッジに属する装飾をエッジのグループの外に描くなら、エッジの識別を持たせ、エッジの強調・減光に追随させる」。
9. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/3090-crossing-marks-follow-edge-focus.md` として昇格し、同じ PR で削除する。hop-path-grouping.md（#2956、実装済みで未昇格）も同じ PR で ADR-2956 に昇格し、ホップの区切りが ADR-3090 で案3 に変わったことを ADR-3090 側の関係として記録する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 交差マークを持つ図の SVG に属性が増え、ホップの `<path>` が増える。見た目は変わらない（band の `stroke-opacity` も含む）。アプリでは hover の焦点が交差マークにも効くようになる。
- ドキュメント更新: `docs/spec/` の変更は無い（交差マークの要素構造は仕様として公開していない）。
- テスト・examples への影響: 交差マークを持つ examples の出力バイト列が変わる。band の `opacity="0.4"` を名指しで確かめるテストは無い（grep 済み）。

## 未解決の問い / 決めないこと

- **facet overlay と diff モードの減光**は本件で直さない。どちらもエッジだけを沈め、交差マークは明るいまま残る。本件の `data-edges` があれば renderer 側で「運ぶエッジがすべて沈んでいるマークを沈める」と書けるので、後続 Issue に分ける。
- **#2632 で edge hover の発火条件を広げたとき**、交差マークの規則も同じ条件に揃える。本件では条件を定数にして、揃える場所を 1 つにするところまで行う。
