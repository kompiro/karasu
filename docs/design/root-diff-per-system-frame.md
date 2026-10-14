# root ビューの compare モードは、各 system フレームの子を system id で突き合わせて diff する

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3126](https://github.com/kompiro/karasu/issues/3126)（#2934 の設計中に見つけた既存の欠落）
  - 関連 ADR: [ADR-2756](../adr/2756-root-view-system-edge-ownership.md)（エッジ側の同じ形。フレームごとに diff する。本件はそのノード側）、[ADR-2934](../adr/2934-same-id-per-node-maps.md)（`nodeDiffByPath` と bare id の見え方の規則。本件の前提）、[ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md)（ルートの card path）、[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（removed ノードの所属の backfill）
  - 関連 TPL: [TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-3126](../test-perspectives/TPL-3126-compare-pairs-revisions-by-identity-not-position.md)（本 PR で起こす proactive TPL）
  - コード: `packages/core/src/diff/view-diff.ts`（`diffSystemViewSlices`）、`packages/core/src/compile/compile-diff.ts`（`compileSystemDiff`）、`packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`）、`packages/app/src/components/PreviewPane.tsx`（詳細パネルの `annotationDiff`）

## 背景・課題

複数 system のルートビューを compare モードで開くと、ノードの diff 状態が付くのは**最初の system の子だけ**である。`diffSystemViewSlices` はノードを `before.childNodes` と `after.childNodes` で突き合わせるが、ルートの `childNodes` は `systems[0]` の子だけで作られる（`extractRootSystemView`）。エッジ側は #2756 でフレームごとに diff するようになったが（ADR-2756）、ノード側は残っていた。

### 実測

`main` = `eb57d7b0`（#2934 マージ後）。次のモデルを before とし、after を変えて `compileSystemDiff`（`viewPath: []`）の各カードの `data-diff-state` を読んだ。

```krs
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker
}
system Admin {
  service Console { description "admin" }
  service Jobs {}
  Console -> Jobs
}
```

| after の変更                                      | 観測                                                                                       | 正しい状態                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `Admin.Console` の description を変える           | `Admin.Console` に状態なし                                                                 | `Admin.Console` = `changed`                                          |
| `Admin` に `service Mail` を足す                  | `Admin.Mail` に状態なし                                                                    | `Admin.Mail` = `added`                                               |
| `Admin` の `service Mail` を消す                  | `Admin.Mail` が**描かれない**                                                              | `Admin.Mail` = `removed` で描く                                      |
| `Admin` を丸ごと消す                              | `Admin` の子が描かれない                                                                   | `Admin.Console` / `Admin.Jobs` = `removed`                           |
| 先頭に `system Billing { service Pay {} }` を足す | **`Billing` の枠に `Api` / `Worker` が `removed` で描かれる**。`Shop` の子は状態なし       | `Billing.Pay` = `added`、`Shop` の子は `unchanged`                   |
| `Shop` を丸ごと消す                               | **`Admin` の枠に `Api` / `Worker` が `removed`、`Console` / `Jobs` が `added`** で描かれる | `Shop` の子は `removed`（`Shop` の枠に）、`Admin` の子は `unchanged` |

下の 2 行は Issue に書かれていない欠落で、本件の調査で見つけた。before と after の `childNodes` は**それぞれの `systems[0]`** の子なので、先頭の system が入れ替わると、別の system の子どうしを突き合わせてしまう。追加・削除のない system の子が `added` と `removed` に化ける。見えない誤りではなく、**誤った差分を描く**誤りである。

詳細パネルの annotation 差分（`PreviewPane` の `annotationDiff`）も bare id で `nodeDiff` を引いている。#2934 はこれを本件に送った（同名ノードのカードで他方の差分を出しうる）。

## 現状（インベントリ）

| 箇所                            | 今日の振る舞い                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diffSystemViewSlices`          | ノードは `childNodes`（= 各 slice の `systems[0]` の子）だけを diff する。`systems` 自体は `diffNodeArray` で union を作り、片方にしかない system は before / after のノードをそのまま持つ。両方にある system は after のノードを持つ |
| `nodeDiffByPath`（#2934）       | `childNodes` の子だけを `canvasCardPathOf(after)` で key する                                                                                                                                                                         |
| bare の `nodes`                 | `childNodes` → `systems` → ghost の順に `diffNodeArray` が書く                                                                                                                                                                        |
| `layoutMultipleSystems`         | 先頭フレームは `viewSlice.childNodes`、それ以外は `sys.children` を並べる。compare モードでは `sys.children` は after のノードの子なので、removed の子は無い                                                                          |
| `diffSystemFrames`（ADR-2756）  | エッジは `systemEdges` を system id で突き合わせて frame ごとに diff 済み。片方にしかないフレームは空の相手と diff する                                                                                                               |
| `compileSystemDiff` の backfill | owner / boundary / scoped boundary / facet の removed ノードの backfill は bare の `diffed.nodes` を回し、ルートでは `before.nodePathIndex` の勝者の path を key にする。facet の path 版だけが `nodesByPath` を回す                  |
| app の詳細パネル                | `annotationDiff={nodeDiff?.get(detailPanel.nodeId)...}`。metadata は `nodePath` を先に引くが、diff は bare id だけ                                                                                                                    |

## 制約・前提

- **compare モードを使わないときの出力は変えない。** 変えるのは `diffSystemViewSlices` の出力と、それを読む compare モードの経路だけ。
- **single system のビューと drill-down は変えない。** これらの slice は `systems` を持たない（または 1 つ）ので、フレームごとの diff は root の複数 system のときだけ効く。
- **`ViewSlice` の型は増やさない。** ADR-2756 が「system ごとの slice 配列への正規化」を費用で却下した判断はそのまま有効。本件もその橋を焼かない形にする。
- **in-place 展開（#1921）は先頭フレーム限定のまま**（ADR-2756「既知の限界」）。
- **out of scope**:
  - ghost と合成 stub の per-node 値（ADR-2934 の範囲外のまま）
  - 同名エッジの共有 `edgeDiff` キーの正規化（ADR-2756 の既知の限界）
  - `layout-grouping` の removed 判定（縮退タブ）が bare の `nodeDiffState` を読むこと。同名ノードの片方だけが removed のときに限って取り違えうる。観測されたら別 Issue にする

## 検討した選択肢

### 案 A: 各 system フレームを system id で突き合わせて diff し、union の system ノードに子の union を持たせる

`diffSystemViewSlices` で union の `systems` の各 system について、before と after の**同じ id の system** の子を `diffNodeArray` に渡す。結果の子の union を、union の system ノードのコピー（`{ ...sys, children: merged }`）に持たせる。`layoutMultipleSystems` は今と同じく `sys.children` を読み、removed の子も並べる。状態は `nodeDiffByPath` に `[system, child]` の path で書く。

先頭フレームだけは `childNodes` が表す（in-place 展開を含むため）。union の先頭 system を P とすると、P の before 側は「before の先頭 system が P なら `before.childNodes`、違えば before の P の子（無ければ空）」にする。after 側は今と同じ `after.childNodes`。

**メリット**

- エッジ側（`diffSystemFrames`）と同じ「system id で突き合わせ、片方にしか無いフレームは空と diff する」形になる（TPL-219）。
- レイアウトも `ViewSlice` の型も変えない。下流は上流（diff）が組み立てた子の集合をそのまま読む（TPL-2756）。
- 先頭の system が入れ替わる欠落も同じ突き合わせで消える。

**デメリット**

- union の system ノードは model のノードではなくコピーになる。`sys.children` を読む他の consumer（`withChildAnchoredEdges` の anchored edge）も removed の子を見るようになる。これは removed の子から出ていた cross-system エッジの起点 system が分かるようになる方向で、悪化ではない。

### 案 B: `ViewSlice` に `systemChildren: Map<systemId, KrsNode[]>` を足し、抽出とレイアウトが使う

`systemEdges` と並べて、フレームごとの子を新しいフィールドで運ぶ。抽出は通常時も埋め、diff はフレームごとに union を作り、レイアウトは `systemChildren.get(sys.id)` を読む。

**メリット**

- ADR-2756 の `systemEdges` と同じ構造で、フレームに閉じるものが 1 箇所に揃う。

**デメリット**

- 子を持つ場所が 3 つになる（`childNodes`、`systems[i].children`、`systemChildren`）。`ViewSlice` を作る全経路（drawio exporter、orphan view、手で組む slice）が埋めるか、レイアウトが `sys.children` に落ちるかを決める必要がある。落ちる fallback を残すなら、案 A と同じ読み方がもう 1 本残る。
- 通常時の抽出まで変わるが、通常時は `sys.children` で正しく描けている。

### 案 C: すべての system の子を `childNodes` に入れて 1 回で diff する

**デメリット**

- `childNodes` は bare id の配列で、`diffNodeArray` も bare id で突き合わせる。`Shop.Api` と `Admin.Api` が 1 件に潰れる（#2934 が直した形に戻る）。レイアウトは先頭フレームにしか `childNodes` を使わないので、他のフレームには届かない。

### 案 D: system ごとに `extractView` を作り直して diff する

ADR-2756 が却下した形。drill-down の slice は別の意味の成果物で、compare モードでは N+1 個の slice を差分することになる。

## 比較

| 観点                               | 案 A                            | 案 B                                  | 案 C                     | 案 D |
| ---------------------------------- | ------------------------------- | ------------------------------------- | ------------------------ | ---- |
| 非先頭フレームの状態・removed の子 | 直る                            | 直る                                  | 直らない（同名が潰れる） | 直る |
| 先頭の入れ替わり                   | 直る                            | 直る                                  | 直らない                 | 直る |
| `ViewSlice` の型                   | 不変                            | フィールド追加                        | 不変                     | 不変 |
| 通常時の出力                       | 不変                            | 不変（ただし抽出を変える）            | 不変                     | 不変 |
| 変更量                             | 小（view-diff と compile-diff） | 中（抽出・レイアウト・全 slice 構築） | 小                       | 大   |

## 現時点の方針

**案 A を採用する。** エッジ側の ADR-2756 と同じ突き合わせ（system id、片方にしか無いフレームは空と diff）をノード側にも適用する。レイアウトと `ViewSlice` の契約を変えず、diff の出力だけで直る。案 B は構造としては揃うが、子の置き場所を 1 つ増やしたうえで fallback が残り、bug 1 件の修正としては変更が広い。

### 突き合わせの規則（1 つ）

**before と after のフレームは system id で突き合わせる。配列の位置では突き合わせない。** 先頭フレームも例外にしない。先頭フレームを `childNodes` で表すのは in-place 展開を含むためで、突き合わせる相手は id で決める。

| union のフレーム                  | before 側                                                                                   | after 側                                |
| --------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| 先頭（P = after の `systems[0]`） | before の先頭が P なら `before.childNodes`、違えば before の P の `children`、無ければ `[]` | `after.childNodes`                      |
| それ以外（S）                     | before の S の `children`、無ければ `[]`                                                    | after の S の `children`、無ければ `[]` |

after に system が 1 つも無いとき（モデルが空）は、union の先頭は before 側の system になる。そのとき先頭の after 側は `after.childNodes`（空）で、before 側は上の規則どおりに決まる。

### bare の `nodes` の見え方

非先頭フレームの子も bare の `nodes` に載せる。同じ bare id のカードが複数のフレームにあるときは、ADR-2934 の規則で選ぶ。`nodesByPath` のカードぶんから `bareIdView` で導き、順位は after の `nodePathRanking` を先に、after に無い path（removed）は before の順位で後ろに足したものを使う。`diffSystemViewSlices` は順位を引数で受け取る（省略時は空。テストや順位を持たない呼び出し元では key の文字列順になる）。system と ghost は今と同じく後から書く。

### 実装の指針

1. **view-diff**: `diffSystemViewSlices(before, after, ranking?)`。
   - union の `systems` を作った後、上の表でフレームごとに before / after の子を決め、`diffNodeArray` に通す。カードの path は先頭フレームが今の `canvasCardPathOf(after)`、それ以外が `[system, child]`（`__unassigned__` は `[child]`。`layoutMultipleSystems` の `frameScope` と同じ規則）。
   - 非先頭フレームは `{ ...sys, children: merged }` に差し替える。先頭フレームは `childNodes` に入れる（今と同じ）。
   - bare の `nodes` はカードぶんを `bareIdView(nodesByPath, ranking)` で導いてから、system と ghost を書く。カードぶんの `diffNodeArray` は bare には直接書かない。
2. **compile-diff**: `diffSystemViewSlices` に after と before の順位を合わせて渡す。owner / boundary の removed backfill は `diffed.nodesByPath` を回し、key はカードの path そのものにする（ルートでも勝者の path を使わない）。scoped boundary の backfill もカードの path から scope と id を取る。bare の facet backfill は bare の見え方のまま。
3. **app**: `SystemDiffCompileResult.nodeDiffByPath` を `useSystemView` → view data → `PreviewPane` に通し、詳細パネルの `annotationDiff` を `nodePath` で先に引く（metadata と同じ順）。
4. **tests**:
   - `packages/core/src/renderer/multi-system-root-diff.test.ts`（新規）: 上の実測表の 6 行を 1 件ずつ固定する。非先頭フレームの `changed` / `added` / `removed`（removed の子が自分の枠の中に描かれる）、system を丸ごと消す・足す、先頭の system が入れ替わる 2 通り。
   - 同名: `Shop.Api` と `Admin.Api` があり `Admin.Api` だけを変えたとき、`Admin.Api` = `changed`、`Shop.Api` = `unchanged`。bare の `nodeDiff.get("Api")` は勝者のもの。`multi-system-same-id.test.ts` の「Admin.Api has no state of its own」の期待を書き換える。
   - group-by team で、非先頭フレームの removed の子が自分の team の帯に戻る（owner backfill を path で行う柵）。
   - app: `PreviewPane` の詳細パネルが同名ノードで自分の annotation 差分を出す。
5. **TPL**: proactive [TPL-3126](../test-perspectives/TPL-3126-compare-pairs-revisions-by-identity-not-position.md)（本 PR で起こす）。実装 PR で「関連テスト」に上のテストのパスを書く。TPL-219 / TPL-2756 は引用だけ。
6. **AT**: `docs/acceptance/3126-root-diff-per-system-frame.md`。TC は:
   - 非先頭フレームの子が `changed` / `added` / `removed` を持ち、removed の子は自分の system の枠に描かれる
   - system を丸ごと足す・消すと、その子がすべて `added` / `removed`
   - 先頭の system を足す・消しても、他の system の子の状態は変わらない
   - 同名ノードは自分の状態だけを持つ
   - 手動: app で `⇄ Paste` に before を貼って compare し、`Admin` の枠のカードに色が付き、消した子が `Admin` の枠に `removed` で描かれ、`Admin.Api` の詳細パネルが自分の annotation 差分を出す
7. **ADR 昇格**: 実装完了後 `docs/adr/3126-root-diff-per-system-frame.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 複数 system のルートを compare モードで開いたとき、すべての system の子に差分の色が付き、消した子が描かれる。先頭の system を足す・消すときの誤った `added` / `removed` が消える。通常の描画は変わらない。
- 公開面: `diffSystemViewSlices` に省略可能な引数が 1 つ増える。`SystemDiffCompileResult.nodeDiff` / `nodeDiffByPath` は型を変えず、非先頭フレームの子のぶん中身が増える。changeset は `@karasu-tools/core` と `karasu` の patch。
- ドキュメント更新: なし（compare モードの spec 節は無い。AT と ADR で記録する）。
- テスト・examples への影響: `multi-system-same-id.test.ts` の #3126 の期待 1 件を書き換える。examples は変わらない。
