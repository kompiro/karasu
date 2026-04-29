# Auto-layout: tuning for Icon display mode

- **日付**: 2026-04-29
- **ステータス**: ドラフト
- **関連**:
  - Issue: [#1000](https://github.com/kompiro/karasu/issues/1000) — Reconsider auto-layout when in Icon display mode
  - 関連 ADR:
    - [ADR-20260411-01](../adr/20260411-01-arch-layout-barycenter-wrap-scope-reduction.md) — barycenter ordering + sub-row wrapping
    - [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md) — orthogonal channel routing for skip-layer edges
  - 関連 Design Doc / 先行実装:
    - [auto-layout-style-hints.md](./auto-layout-style-hints.md) — `.krs.style` 経由の presentation-only hint の枠組み（[#969](https://github.com/kompiro/karasu/issues/969) / 実装 PR [#1010](https://github.com/kompiro/karasu/pull/1010)）。`ResolvedStyles.layoutHints` に hint を載せ、layout 側で参照する。column hint がその第一弾。
  - 関連コード: `packages/core/src/renderer/layout.ts`,
    `packages/core/src/renderer/edge-routing-{channels,lanes,ports}.ts`

## 背景・課題

現行 auto-layout（tier 割当 → barycenter ordering → sub-row wrap → port
distribution → channel routing）は **shape display mode**（可変幅カード）を
前提に定数が選ばれている。`displayMode = "icon"` では以下の固定寸法に
切り替わる:

| カード種別            | 幅  | 高さ              |
| --------------------- | --- | ----------------- |
| Icon（説明なし）      | 160 | 56                |
| Icon（説明あり）      | 160 | 100               |
| Shape（参考・典型値） | 約 220–280 | 約 90–140  |

`displayMode` 分岐は `measureNode()`（`layout.ts:1370`）にしかなく、
gap・wrap 閾値・edge routing パラメータはすべて両モード共通である:

| 定数             | 値    | 由来               |
| ---------------- | ----- | ------------------ |
| `LAYER_GAP`      | 120   | shape 想定         |
| `NODE_GAP`       | 60    | shape 想定         |
| `MAX_LAYER_WIDTH`| 1200  | shape 想定         |
| `LANE_BAND`      | 18    | edge-routing 共通  |

### 数値で見たミスマッチ

- **水平方向**: NODE_GAP / カード幅
  - shape: 60 / 約 250 ≈ 24%
  - icon : 60 / 160 = 37.5% — 約 1.5 倍ゆるい
- **垂直方向**: LAYER_GAP / カード高さ
  - shape: 120 / 約 120 ≈ 100%
  - icon (説明なし): 120 / 56 ≈ 214% — 2 倍以上空く
  - icon (説明あり): 120 / 100 = 120%
- **行折り返し**: MAX_LAYER_WIDTH=1200 で
  - shape（幅 250 想定）: 1 行に 約 4 ノード
  - icon: 1 行に 5 ノード（5×160+4×60=1040、6 つ目で 1320 > 1200）
  - 折り返し件数自体は近いが、見えの密度が大きく異なる

要するに icon mode は「カードが小さくなったのに余白だけ shape 基準のまま」で、
視認性ではなく**疎な配置**になる。Issue #1000 の「Icon mode は icon 同士を
寄せて typology を強調すべき」という観点とも一致する。

### 補足: edge routing 側の影響

- `LANE_BAND=18`（`edge-routing-lanes.ts:27`）はピクセル固定。
  カード高さが 56px の icon mode では LANE_BAND がカード高の 32% を占め、
  視覚的にレーン縞が目立ちやすい。ただし LAYER_GAP=120 のうち
  18 しか使わないので衝突はしない。
- ポート分散（`i/(N+1)`）はカード幅相対なので displayMode に追従済み。
  追加対応は不要。

## 制約・前提

- 現行の tier + barycenter + sub-row wrap パイプラインは ADR-20260411-01・
  ADR-20260429-01 で定着しており、icon mode のためにパイプライン自体を
  分岐させると Phase 2/3 ルーティングの恩恵を再実装することになる。
- スコープ外:
  - `displayMode` API そのものの変更
  - icon-rendering プリミティブ（凡例・アイコンマニフェスト等）の変更
- 既存テスト（`layout.test.ts > icon mode`）は寸法のみを assert している
  ので、定数変更に伴う y/x 値の更新が必要になる。

## 検討した選択肢

### 案1: 定数を displayMode で切り替える（recommended）

`LAYER_GAP`・`NODE_GAP`・`MAX_LAYER_WIDTH` を mode 別テーブルに置き換え、
`measureNode()` と同様に displayMode を引数で引き回している既存箇所で
参照する。

提案値（初期値、AT で要調整）:

| 定数             | shape (現行) | icon (案) | 理由                                    |
| ---------------- | ------------ | --------- | --------------------------------------- |
| `LAYER_GAP`      | 120          | 80        | 56px カードに対して 143% に圧縮         |
| `NODE_GAP`       | 60           | 36        | shape の 24% 比率に揃える（160×0.225）  |
| `MAX_LAYER_WIDTH`| 1200         | 1040      | 1 行 5 ノードで wrap される閾値を維持   |

メリット:
- Phase 2/3 ルーティングを含むパイプライン全体を再利用できる。
- 変更点が定数と参照箇所だけで surgical。
- icon mode の典型例（Getting Started、EC Platform）で行折返し件数を
  shape mode とほぼ揃えられる。

デメリット:
- 定数テーブルが二系統になり、将来 mode 追加時に分岐が増える。
- gap がピクセル固定で edge routing 等の他定数（LANE_BAND）と独立に動くため、
  狭くしすぎるとラベル・LANE が重なる可能性がある（→ AT で要検証）。

### 案2: icon mode 専用レイアウト戦略にブランチする

tier ベースを捨てて icon mode は密グリッドパッキング（kind/annotation で
グループ化、固定セルに敷き詰め）にする。

メリット:
- icon mode の「typology を視覚的に強調する」ねらいに最も忠実。
- 既存パイプラインの制約（forced layer、ghost、orthogonal routing）と
  分離できる。

デメリット:
- 新コードパスを 1 本増やす。Phase 2/3 routing の恩恵を再実装するか、
  片肺だけ improvement されないか、どちらかになる。
- icon mode↔shape mode 切替で配置が大きく変わるとレビュー・差分が
  読みづらくなる（同じトポロジが mode で別の絵に見える）。
- ADR-20260411-01 の「barycenter は両 mode 共通」前提に反するため
  別 ADR が必要。
- 投資対効果が見えにくい — 案 1 で十分まともになる可能性が高い。

### 案3: 現状維持 + 文書化

「icon mode はサムネイル・全景把握用途で、密度を求める利用は shape mode」
と `docs/spec/style.md` ないし `docs/concepts.md` に明記。

メリット:
- コード変更ゼロ。

デメリット:
- Issue #1000 の「Icon mode looks worse」観察への直接の解は得られない。
- ユーザーがデフォルト値で違和感を持つたびに同じ Issue が再提起される。

## 比較

| 観点                       | 案1: 定数切替 | 案2: 専用戦略 | 案3: 現状維持 |
| -------------------------- | ------------- | ------------- | ------------- |
| 視覚的改善                 | 中〜大        | 大            | なし          |
| 実装コスト                 | 小            | 大            | 極小          |
| 既存ルーティングの再利用   | ✅            | ❌（要再実装）| ✅            |
| 将来の保守コスト           | 中（定数二系統）| 大          | 小            |
| ロールバック容易性         | 高            | 低            | —             |

## 現時点の方針

**案 1（定数を displayMode で切り替える）を採用する**。

理由:
- 数値ミスマッチ（垂直 +114%、水平 +56%）が定量的に説明でき、定数調整で
  直接対応できる。
- Phase 2/3 routing を含む現行パイプラインを温存しつつ icon mode の見栄えを
  改善できる費用対効果が最も高い。
- 観測した結果案 1 では足りない（典型例で依然崩れる）と分かった時点で
  案 2 に拡張する余地が残る。

### 実装ステップ

1. `layout.ts` の冒頭で gap 定数を mode 別 lookup に置き換える
   （`getLayoutConstants(displayMode)`）。
2. `MAX_LAYER_WIDTH` を参照している wrap 判定（`layout.ts:942`）と
   `placeGhostUsers`/`placeGhostDomains`/forced 系の `NODE_GAP`/`LAYER_GAP`
   参照箇所を、定数 lookup 経由に書き換える。
3. `layout.test.ts > icon mode` を拡張: 寸法だけでなく、
   `MAX_LAYER_WIDTH` 折り返し境界で 5 ノード／行となること、
   `LAYER_GAP` 改定後の y 座標を assert する。
4. AT として Getting Started・EC Platform・multi-system の icon
   レンダリングを目視確認し、shape mode と比較した
   スクリーンショットを `docs/acceptance/` に残す（Issue 投資タスクの
   "Render representative diagrams" 項目の解消）。

### 観測すべきリグレッション

- icon mode の sub-row wrap 後にラベル / 凡例が重ならないか
- LANE_BAND=18 と圧縮後の LAYER_GAP=80 の差が十分あるか
  （マルチレーン交差時のラベル・arrowhead の隙間）
- forced system layout（ADR-20260429-02 系列）で ghost ノード配置が
  狭すぎになっていないか

これらが問題なら案 1 のパラメータを再調整し、それでも崩れる典型例が
出た場合のみ案 2 へエスカレーションする。

## 未解決の問い

- `LAYER_GAP` を 80 まで詰めると、orthogonal channel routing
  （ADR-20260429-01）の skip-layer エッジ用 L 字経路が
  入りきらないケースが出るか? Phase 2 の channel allocation は
  上下のレイヤ間の中央付近にチャネルを引くため、80px 中
  18px LANE_BAND を載せても余裕は残る見込みだが要検証。
- 案 1 の icon-mode 定数を `.krs.style` 経由でユーザーがオーバーライド
  できるべきか?
  - 先行事例として [#1010](https://github.com/kompiro/karasu/pull/1010) で
    `column` hint が `.krs.style` → `ResolvedStyles.layoutHints` →
    layout 側参照、というルートを既に敷いている。**新規枠組みではなく、
    既存枠の延長**として `gap` 等を追加できる素地はある。
  - ただし column hint は **per-node** の x バケット指示なのに対し、
    icon-mode の gap は **diagram-wide な定数**であり、`layoutHints`
    （Map<nodeId, hint>）の粒度には合わない。導入するなら
    `ResolvedStyles` 側にトップレベルの `layoutDefaults` を追加する
    別の階層が必要。
  - **当面の方針は内部定数に閉じる**。利用者からの要望が具体化したら、
    `layoutDefaults`（diagram スコープ）として `auto-layout-style-hints`
    の続編で別途設計する。
- icon mode の縦折返しは shape mode と同じ「`MAX_LAYER_WIDTH` を超えたら
  次の sub-row」で良いか、それとも「アイコン何枚で揃える」（例: 4 枚
  単位の格子）の方が読みやすいか — Getting Started を icon で見て
  ユーザーに判断を仰ぐ。
