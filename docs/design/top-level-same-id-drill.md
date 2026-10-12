# system 段のない path はトップレベルのノードとして先に解決する

- **日付**: 2026-10-12
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3113](https://github.com/kompiro/karasu/issues/3113)
  - 関連 ADR: [ADR-681](../adr/681-top-level-service-rendering.md)（トップレベルの service / domain を `__unassigned__` 擬似 system で描く）, [ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md)（複数 system のルートで同じ id のノードを両方描く。カードの `data-node-path` で click を引く）, [ADR-110](../adr/110-permanent-link.md)（permalink と `nodePathIndex`）
  - 関連 Design Doc: [static-bundle-same-id-levels.md](./static-bundle-same-id-levels.md)（#2933。静的バンドル側の同じ根。本件はそこから切り出した SPA 側）
  - 関連 TPL: [TPL-1160](../test-perspectives/TPL-1160-top-level-orphans.md)（トップレベル宣言を全消費側で扱う）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（key は区別に要る次元を全部含む）, [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（静的 SVG と SPA のアンカー parity）, [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（同じ id が 1 キャンバスに 2 つあるときの着地点）, [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並行する関数の同等性）, [TPL-2756](../test-perspectives/TPL-2756-downstream-consumes-what-upstream-assembled.md)（下流は上流の成果物を作り直さない）
  - コード: `packages/core/src/view/view-extract.ts`（`resolveContainerChain`）, `packages/app/src/hooks/useBreadcrumbs.ts`, `packages/app/src/hooks/useChatSession/prompt.ts`（`detectDrillDownLevel`）, `packages/core/src/parser/reference-validation.ts`（`buildNodePathIndex`）, `packages/core/src/compile/compile.ts`（`buildNodeMetadata`）, `packages/core/src/renderer/layout.ts`（`frameScope`）

## 背景・課題

トップレベル（system の外）のノードが、ある system の子と同じ id を持つと、SPA でそのトップレベルのノードに入れない。

```krs
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
service Api { domain Parked { usecase P {} } }
```

main（19d18f68）で測った結果:

| 入力 `viewPath`                                                                                  | 描かれるノード                | 期待     |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | -------- |
| `["Api", "Parked"]`（`nodePathIndex.get("Parked")`、`#krs-system-Parked` の解決先）              | なし（空のビュー）            | `P`      |
| `["Api"]`（ルートの Unassigned 枠の `Api` カードの `data-node-path`。click はこれで drill する） | `Orders`（`Shop.Api` の中身） | `Parked` |
| `["__unassigned__", "Api"]`                                                                      | `Parked`                      | `Parked` |
| `["Shop", "Api"]`                                                                                | `Orders`                      | `Orders` |

Issue に書かれた permalink の症状（空のビュー）に加えて、**ルートで Unassigned 枠の `Api` カードを click すると `Shop.Api` の中身が開く**。こちらは診断も出ず、見た目には正しいビューに見えるので気づきにくい。

原因は 1 か所。`resolveContainerChain` は path の先頭が system id でないとき、**先頭の id を子に持つ最初の system** を選んで歩く。トップレベルのノードは `__unassigned__` 擬似 system の子で、実 system より後ろに並ぶので、同じ id の実 system の子があると必ずそちらが選ばれる。選んだ system で歩けなくても、ほかの候補は試さない。

## 現状（インベントリ）

SPA の permalink と click で path を書くのは次の 3 か所。どれも**トップレベルのノード**を名指すときだけ system 段を省く。実 system の子には必ず system id を付ける。

| 書き手                                                                                | トップレベルのノード        | 実 system の子              |
| ------------------------------------------------------------------------------------- | --------------------------- | --------------------------- |
| `buildNodePathIndex`（permalink・`nodeMetadata.viewPath`）                            | `["Api", "Parked"]`         | `["Shop", "Api", "Orders"]` |
| ルートのカード `data-node-path`（`layout.ts` の `frameScope`）と `nodeMetadataByPath` | `Api`                       | `Shop.Api`                  |
| drill 先のカード `data-node-path`（`layout()` の `scopePath`）                        | `__unassigned__.Api.Parked` | `Shop.Api.Orders`           |

読み手は 3 つある。どれも path の先頭が system id かどうかで分岐し、system id でないときの扱いがそれぞれ違う。

| 読み手                                       | 使う場所                                                                        | 先頭が system id でないとき                                    | `["Api", "Parked"]` の結果        |
| -------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| `resolveContainerChain`（core）              | `extractView`（SPA の system ビュー、静的バンドル、diff）と `extractEntityView` | 先頭の id を子に持つ最初の system から歩く                     | 空のビュー                        |
| `useBreadcrumbs`（app）                      | パンくずと scope ラベル                                                         | `systems[0]` を置き、先頭の段を**読み飛ばして** 2 段目から歩く | パンくずが `Shop` だけ            |
| `detectDrillDownLevel`（app の chat prompt） | Chat に渡すレベル（system / service / domain / usecase）                        | `"system"` を返す                                              | `"system"`（正しくは `"domain"`） |

app の 2 つはビューを抽出しないので空にはならないが、id の衝突が無くても、system 段のない path ではトップレベルのノードを正しく読めない。ルートの Unassigned 枠のカードを click したときと permalink で開いたときに、パンくずが実 system の名前だけになる。drill 先のカードの click は `__unassigned__` 付きの path を渡すので、パンくずは `Unassigned > Api > Parked` になる。同じノードを開いても、パンくずが入口によって変わる。

system 段を省いた path で実 system の子を引く呼び出し方も今は通っている（`["Api", "Orders"]` → `Shop.Api.Orders`）。リポジトリ内でそう書くのは静的バンドルの walk（`drill-down-svg.ts` / `all-layers-svg.ts`）だけで、複数 system のルートの子を `[child.id]` で組む。これは #2933 が直している最中で、PR #3125 は walk を full path（擬似 system の段を含む）に変える。drawio exporter は `krsFile.systems` から walk するので path は system id から始まり、擬似 system を合成せずにトップレベルの domain を `unassignedDomains` で別に渡す。

## 制約・前提

- permalink の文法（`#krs-<view>-<id>`）と `nodePathIndex` の値は変えない。外に出た URL と、`nodePathIndex` を読む既存の消費側（#2933 の静的バンドル、`compile-diff`、`nodeMetadata`）をそのまま保つ
- system 段を省いて実 system の子を引く呼び出しは、トップレベルに同じ path が無い限り今と同じ結果を返す
- カードの `data-node-path` の形（ルートで擬似 system の段を落とし、drill 先で残す）をそろえるかどうかは本件で決めない（「未解決の問い」）

## 検討した選択肢

### 案1: system 段のない path は、まずトップレベルとして歩き、だめなら実 system で歩く

`resolveContainerChain` の、先頭が system id でない分岐だけを変える。候補を順に歩き、**path の最後まで歩けた最初の候補**を返す。

1. `__unassigned__` 擬似 system（`systems` に含まれるとき）
2. 別引数で渡されたトップレベルの service / domain（drawio exporter の経路）
3. 先頭の id を子に持つ実 system（宣言順）

**メリット**

- 書き手 3 か所の約束（system 段が無い path はトップレベル）を、読み手がそのまま読む形になる。permalink・ルートの click・drill 先の click が同じノードに着く
- 解決は 1 関数にまとまり、`extractView` と `extractEntityView` に加えて、app の 2 つの読み手もそれを呼ぶ形にできる（実装の指針 2）
- トップレベルで歩けない path は今と同じく実 system で解決するので、system 段を省いた既存の呼び出しは変わらない

**デメリット**

- 同じ path がトップレベルと実 system の両方で歩ける場合、system 段を省いた呼び出しはトップレベルに着く。今は実 system に着く。そうした path を実 system の子のつもりで書くのは、main では静的バンドルの walk だけ（インベントリ）。そこは今も同じ id の 2 ノードが同じ path になり、どちらに着いても片方の中身しか描かれない（#2933）。本件で着地点が実 system からトップレベルに入れ替わるが、壊れ方は同じで、#3125 が full path に変えると両方とも正しく描かれる。#3125 と本件のどちらが先にマージされても、両方が入った状態は正しい

### 案2: トップレベルのノードの path に、曖昧にならない段を付ける

`nodePathIndex` とルートのカードで、トップレベルのノードの path に `__unassigned__` を付ける（drill 先と同じ形にそろえる）。

**メリット**

- path だけで所属が決まり、読み手に順序の約束が要らない

**デメリット**

- 合成した id が `nodePathIndex` と permalink の解決先に出る。ADR-681 は擬似 system を描画のための枠として導入しており、モデルの path の一部にはしていない
- `nodePathIndex` を読む消費側（#2933 の canonical 判定、`compile-diff`、`nodeMetadata.viewPath`）と、その前提で書かれた spec（`docs/spec/permalink.md`）を全部直すことになる。#2933 は「Unassigned の walk path は擬似 system の段を外して比べる」と決めたばかりで、逆向きの変更になる
- 読み手の分岐は残る（擬似 system の段を持たない古い path を読み続けるため）

### 案3: 歩けなかったときだけ、ほかの候補を試す

今の順序（実 system が先）を保ち、歩けなかったときだけトップレベルを試す。

**メリット**

- 今 実 system に着く呼び出しは 1 つも変わらない

**デメリット**

- ルートの click の症状（`["Api"]` が `Shop.Api` に着く）が直らない。`["Api"]` は実 system でも歩けてしまうので、フォールバックが発火しない

## 現時点の方針

**案1 を採用する** — 書き手 3 か所はすでに「system 段が無い = トップレベル」で一致しており、ずれているのは読み手だけだから。案3 は path が両方で歩けるときに直らず、ルートの click の症状が残る。案2 は読み手の分岐を消せないうえ、合成 id を公開の path に出し、#2933 で決めた比較の向きとも逆になる。

### 実装の指針

1. `resolveContainerChain`（`view-extract.ts`）の、先頭が system id でない分岐を「候補を順に歩き、最後まで歩けた最初の候補を返す」に変える。候補の順は案1 の通り。`ancestorChain[0]` は今と同じく所属の system（擬似 system を含む）にする。別引数のトップレベル候補のときは、今と同じく `systems[0]` を置く
2. **読み手を 1 つにする**: 解決した ancestor chain（`[system, …, container]`）を返す関数を core から export し、`useBreadcrumbs` と `detectDrillDownLevel` は自前で `viewPath[0]` を読まずにそれを呼ぶ。パンくずの各項目の `navigatePath` は、解決した chain の段ごとに入力 path の接頭辞を切って作る（system 段のない入力なら system 段のないまま。drill の挙動は今と変えない）。chain の先頭が擬似 system のとき、パンくずの先頭は擬似 system のラベル（`Unassigned`）にし、drill 先のカードから入ったときと同じ表示にそろえる。並行する読み手を別々に直すと、次の書き手の変更でまたずれる（TPL-219、TPL-2756）
3. 擬似 system の判定は `unassigned-system.ts` に小さな述語を足して使い、`"__unassigned__"` を `view-extract.ts` や app に直書きしない
4. `ViewPath` 型のコメント（`view-extract.ts`。今は「Unassigned top-level domains retain single-segment paths」）を、本件の約束「system 段のない path はトップレベルのノードを指し、トップレベルで歩けなければ実 system で歩く」に書き換える
5. テスト（`view-extract.test.ts`、compile 経由の 1 本、`useBreadcrumbs.test.ts`）:
   - Issue の再現: `viewPath: ["Api", "Parked"]` で `P` が描かれる
   - ルートの click: `["Api"]` でトップレベルの `Api` の中身（`Parked`）が描かれる
   - 実 system 側が変わらない: `["Shop", "Api"]` と `["Api", "Orders"]` は `Shop.Api` 側
   - round-trip: ルートと drill 先の各カードについて、`nodeMetadataByPath` の `viewPath` と `nodePathIndex` の path で `compile` したとき、そのカードのノードの子が描かれる
   - `extractEntityView` が同じ解決を使う: トップレベルの domain の entity ビューが空にならない
   - drawio exporter の経路（擬似 system なし、`unassignedDomains` を別引数）で同じ id の衝突を解決する
   - パンくず: `["Api", "Parked"]` と `["__unassigned__", "Api", "Parked"]` が同じラベル列（`Unassigned > Api > Parked`）になり、`["Shop", "Api"]` は今と同じ `Shop > Api` のまま。`detectDrillDownLevel(["Api", "Parked"])` は `"domain"`
6. TPL: 3-Yes ルールに当てはまる（ほかの path の読み手にも横展開しうる、書き手と読み手が別々に進化するので構造的に再発しうる、既存 TPL は key の次元（TPL-1352）と 1 キャンバス上の着地点（TPL-2920）までで「書いた path が同じノードに戻る」を扱っていない）。実装 PR で retrospective TPL-3113「ノードを名指す path を書く側と解決する側は同じノードに着地する」を起こす
7. AT: `docs/acceptance/` に新規。TC は「Unassigned 枠の `Api` カードを click して `Parked` が見え、パンくずが `Unassigned > Api`」「`#krs-system-Parked` を開いて `P` が見え、パンくずが `Unassigned > Api > Parked`」。どちらも e2e で自動化できる
8. changeset: `@karasu-tools/core` と `karasu` に patch（app は版管理対象外）
9. ADR 昇格: 実装マージ後、`docs/adr/3113-top-level-same-id-drill.md` に昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: トップレベルのノードと実 system の子が同じ id を持つモデルで、トップレベル側の drill と permalink が正しいノードに着くようになる。id が衝突しないモデルでも、トップレベルのノードをルートの click や permalink で開いたときのパンくずが `Unassigned > …` になる（今は実 system の名前だけ）。描かれるビューは変わらない
- ドキュメント更新: `docs/spec/permalink.md` に、system 段の無い path がトップレベルのノードを指すことを 1 文足す（`nodePathIndex` の値の形は既に書かれているので、解決の向きだけを足す）。spec の追記なので、上の TPL-3113 を `> Related TPLs:` で紐付ける
- テスト・examples への影響: なし

## 未解決の問い / 決めないこと

- **カードの `data-node-path` の形をそろえるか**: ルートでは擬似 system の段を落とし（`Api`）、drill 先では残す（`__unassigned__.Api.Parked`）。Issue のコメントの通り、今は drill 先の形が衝突を避けているので、本件の前にそろえると壊れる。本件の後なら、どちらの形でも同じノードに着くので、そろえるかどうかは表示上の都合だけで決められる。#2933（PR #3125）は `withoutUnassignedSegment` で比べる側を正規化しているので、急ぐ理由はない。本件では触らない
- **トップレベルのノードの id が system id と同じ場合**（`system Api` とトップレベルの `service Api`）: path の先頭が system id に一致するので、`resolveContainerChain` は今も本件の後も system として読み、トップレベルの `Api` には入れない。読み手の候補順では直らず、path の形（案2 の方向）か id の検証で扱う問いなので、本件では触らない。必要なら別 Issue にする
- **同じ id のトップレベルのノードが 2 つある場合**（トップレベルの `service Api` と `domain Api`）: 擬似 system の子の中で最初に歩けたものに着く。これは擬似 system の内側の重複で、本件の衝突（擬似 system と実 system の間）とは別の問題として扱う
