# 解決済み edge スタイルの kind 無しキーと kind 付きキーを重ならないようにする

- **日付**: 2026-11-08
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3702](https://github.com/kompiro/karasu/issues/3702)（#3481 のレビューで発見）
  - 関連 Design Doc: [injective-node-path-keys](injective-node-path-keys.md)（`edgeKey` の囲み規則を決めた案D。ADR への昇格はまだ）
  - 関連 ADR: [ADR-2714](../adr/2714-deploy-container-id-injective.md)（`nodePathRefId` で区切りを含む segment を囲んだ前例）, [ADR-3480](../adr/3480-edge-canonical-id-quoted-endpoints.md)（`.krs.style` に書く canonical id。内部キーとは別の規則）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  - コード: `packages/core/src/view/edge-key.ts`, `packages/core/src/resolver/style-resolver.ts`, `packages/core/src/renderer/svg-renderer.ts`

## 背景・課題

解決済みスタイルの `styles.edges` は、1 つのマップに 2 つの形のキーを持つ。どちらも `edgeStyleKey` が書く。

- kind 付きキー `edgeKindKey(edge)`（`<pair>#<kind>`）: model の edge が自分のスタイルを引く
- kind 無しキー `edgeKey(edge)`（`<pair>`）: kind を持たない layout edge（delivers・owns・ghost・集約 edge）の fallback

`edgeKey` は `->`・`"`・`\` を含む端点だけを `.krs` の文字列リテラル形で囲む（案D）。`#` は囲まないので、`#sync` / `#async` で終わる端点を持つ edge の kind 無しキーが、別の edge の kind 付きキーと同じ文字列になる。`x -> "y#sync"` の kind 無しキーは `x->y#sync` で、`x -> y` の sync のキーと同じである。後に書いた方が残る。

`svg-renderer.ts` はこのマップの全キーから `edgeDirections` を作り、レイアウトは kind 無しキー（`edgeKey(edge)`）で `direction` を引く。同じ衝突で `direction` も取り違える。

main（f5ad4897）で、各 edge の stroke と各ノードの y 座標を SVG から読んだ実測:

```krs
system S {
  service x {}
  service y {}
  service "y#sync" {}
  x -> y "a"
  x -> "y#sync" "b"
}
```

| model の順 | rule | `x -> y` | `x -> "y#sync"` |
| --- | --- | --- | --- |
| `x -> y` が先 | `edge#x->y { color: #00FF00; }` | 既定色 | 既定色 |
| `x -> y` が先 | `edge#x->"y#sync" { color: #00FF00; }` | 緑 | 緑 |
| `x -> "y#sync"` が先 | `edge#x->y { direction: up; }` | 上下が入れ替わる | 上下が入れ替わる |
| `x -> "y#sync"` が先 | `edge#x->"y#sync" { direction: up; }` | そのまま | そのまま |

どの場合も診断は出ない。`x -> y` が先のとき、`x -> y` 自身の kind 付きキーが `x -> "y#sync"` の kind 無しキーで上書きされる。逆の順では、`x -> y` の kind 付きキーが `x -> "y#sync"` の kind 無しキーを上書きする。

`edgeKindKey` の doc は injective だと述べており、kind 付きキーどうしでは正しい。kind 無しキーと混ぜたマップでは成り立たない。

## 現状（インベントリ）

`edgeKey` / `edgeKindKey` で書くマップのうち、2 つの形を混ぜるのは次の 2 つだけである。

| マップ | キーの形 | 混ざるか |
| --- | --- | --- |
| `styles.edges`（`style-resolver.ts`） | kind 付き + kind 無し | 混ざる |
| `edgeDirections`（`svg-renderer.ts`、`styles.edges` の全キーから作る） | kind 付き + kind 無し。引くのは kind 無しだけ | 混ざる |
| diff の `edgeDiffState`、`deploy-view-diff.ts`、`group-collapse.ts` | kind 無し | 混ざらない |
| `implicitEdgeDetails`（`derived-edges.ts`） | kind 付き | 混ざらない |
| `edgeDiffKeyOf`（`view-diff.ts`） | キーは kind 付き、値が kind 無し | 混ざらない |
| view extract の dedup・抑止、`edge-routing-bundles.ts` のバンドル | kind 無し | 混ざらない |

`edgeKey` は core の index から export されているが、core の外（app・vscode・cli・lsp・nest）には読み手も書き手も無い。SVG にも出ない。SVG の `data-edge-canonical-id` と `edge#` セレクタは ADR-3480 の `edgeBaseForm` が作り、`edgeKey` とは関係しない。

## 制約・前提

- 普通のモデル（端点に `#`・`->`・`"`・`\` を含まない）では、どのキーの文字列も変えない
- 書き手と読み手が同じヘルパーを通す（TPL-1352）。#3481 で `edgeStyleKey` とレイアウトの `direction` の引き当てを `edgeKey` / `edgeKindKey` に揃えたので、それを崩さない
- `.krs.style` に書く canonical id（ADR-3480）は対象外。内部キーの injectivity と、`.krs.style` で読み戻せることは別の条件である（ADR-3480「却下した案」）
- 対象外: positional label の読み方（`a -> "b->c"` の次の行の `"a->b" -> c` が label として読まれる件）。キーの問題ではない

## 検討した選択肢

### 案1: `edgeKey` が `#` を含む端点も囲む

`quoteEdgeEndpoint` の条件に `#` を足す。案D は「join を曖昧にする文字（区切りの `->` と、引用形を作る `"` / `\`）を含む端点を囲む」規則で、`#` は `edgeKindKey` が足す区切りである。足すと、kind 無しキーには引用の外に `#` が現れず、kind 付きキーには引用の外にちょうど 1 つ現れる。2 つの形はどのマップでも重ならない。

**メリット**

- 変更は `quoteEdgeEndpoint` の 1 行。`styles.edges` と `edgeDirections` が同時に直る
- 書き手と読み手は今のまま `edgeKey` / `edgeKindKey` を通るので、#3481 の揃え方を崩さない
- 今は混ぜていないマップが将来 2 つの形を混ぜても衝突しない
- `edgeKindKey` の「最後の `#` で割れる」という説明が、kind 無しキーに対しても成り立つ

**デメリット**

- `#` を含む端点を持つ edge では、diff・dedup・バンドルのキー文字列も変わる（`x->"y#sync"`）。どれも同じヘルパーで書いて引くので挙動は変わらないが、公開の `edgeKey` の出力が変わる

### 案2: `styles.edges` のキーだけで `#` を囲む

`edgeStyleKey` が `edgeKey` を使わず、自前の囲み規則を持つ。

**メリット**

- diff・dedup・バンドルのキーは変わらない

**デメリット**

- レイアウトの `direction` の引き当て（`layer-assignment.ts` 2 か所・`layer-layout-logics.ts`）も `edgeStyleKey` に替える必要がある。#3481 で `edgeKey` に揃えたばかりの箇所を、別の規則に分ける
- edge の組のキーを作る規則が 2 つになる。TPL-1352 の「ヘルパーを 1 つにする」に反する

### 案3: kind 付きと kind 無しを別のマップに分ける

`ResolvedStyles` に kind 無しの fallback 用のマップを足し、`edges` は kind 付きキーだけにする。`nodesByPath` が `nodes` と別のマップになっているのと同じ形である（#2934）。

**メリット**

- 2 つの形が 1 つのマップに入らないので、キーの文字列に頼らずに衝突が消える

**デメリット**

- 公開の型 `ResolvedStyles` にフィールドが増える
- 読み書きする 5 か所を変える。書き込みは `style-resolver.ts` の 2 か所、読み取りは `edge-line-key.ts` の fallback、`svg-renderer.ts` の `edgeDirections` と矢印 marker の色の収集である
- kind 無しキーを直接読み書きするテストが 7 行ある（`svg-renderer.test.ts` 2・`mutual-pair.test.ts` 1・`label-placement.test.ts` 4）
- `nodesByPath` が別マップにしたのは、素の id `"Shop.Api"` と path `Shop.Api` が別の識別の空間で、同じ文字列を取りうるからである。edge の 2 つの形は同じ `edgeKey` から作るので、区切りを囲めば文字列のまま分けられる

### 案4: `#sync` / `#async` で終わる端点だけを囲む

**メリット**

- 囲まれる端点が最も少ない

**デメリット**

- 規則が `EdgeKind` の値の一覧に依存する。kind が増えると黙って壊れる
- 案D の「区切りを含む端点を囲む」という規則の形から外れる

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 変更量 | 1 行 + テスト | 引き当て 3 か所 + 規則 1 つ | 型 + 読み書き 5 か所 + テスト 7 行 | 1 行 + テスト |
| 公開 API | `edgeKey` の出力（`#` を含む端点だけ） | 変わらない | `ResolvedStyles` の型 | `edgeKey` の出力（`#sync` / `#async` で終わる端点だけ） |
| 普通のモデルのキー | 変わらない | 変わらない | 変わらない | 変わらない |
| キーの規則の数 | 1 | 2 | 1 | 1 |
| 将来の混在 | 安全 | `styles.edges` だけ安全 | 安全 | kind 追加で壊れる |

## 現時点の方針

**案1 を採用する。** `quoteEdgeEndpoint` の条件を `/["\\#]/` に替えて上の表と同じモデルを測ると、model の順がどちらでも、4 つの rule はそれぞれ書いた edge だけの色と上下を変えた。`#` は `edgeKindKey` が足す区切りなので、案D の規則（区切りを含む端点を囲む）をそのまま当てはめるだけで 2 つの形が重ならなくなる。書き手と読み手は今のヘルパーのままで、#3481 の揃え方も TPL-1352 の「ヘルパーを 1 つ」も保てる。変わるのは `#` を含む端点の edge のキー文字列だけで、それを core の外で読むコードは無い。

案3 は構造としては最も堅く、費用も大きくはない。それでも採らないのは、直るのが `styles.edges` と `edgeDirections` だけだからである。2 つの形が重なる性質は `edgeKey` / `edgeKindKey` 自体に残り、次に 2 つの形を混ぜたマップが同じ衝突を起こす。案1 はその性質をヘルパーの側で消す。

### 実装の指針

1. `packages/core/src/view/edge-key.ts`: `quoteEdgeEndpoint` の条件を `/["\\#]/` にし、`edgeKey` と `edgeKindKey` の doc に `#` を囲む理由（kind の区切りなので、kind 無しキーと kind 付きキーが重ならない。#3702）を足す
2. テスト:
   - `edge-key.test.ts`: `#` を含む端点の `edgeKey` が囲まれること、`edgeKey({ from: "x", to: "y#sync" })` が `edgeKindKey({ from: "x", to: "y", kind: "sync" })` と違うこと、普通の id のキーが変わらないこと
   - `style-resolver.test.ts` の `edgeStyleKey (#3481)`: kind 無しキーと kind 付きキーが重ならないこと
   - `index.test.ts`: 上の表の 4 行（色 2 つ・`direction` 2 つ、model の順も表のとおり）。修正前のコードで落ちることを確かめる
3. TPL-1352: `discovered_from` に #3702 を足し、チェックリストに「1 つのマップに複数の形のキーを入れるなら、形どうしが重ならないことを確かめる」を足す。既知の consumer の節を 1 つ足す
4. AT: `docs/acceptance/3702-edge-style-kind-key-disjoint.md`。手動項目は無い
   - 色: `x -> y` と `x -> "y#sync"` のどちらに書いた rule も、その edge だけに効く
   - `direction`: 同じく、その edge の端点だけが入れ替わる
   - 普通のモデルのキーは変わらない
5. ADR 昇格: 実装 PR のマージ後、`docs/adr/3702-edge-style-kind-key-disjoint.md` として昇格し、本 Design Doc を同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `#` を含む端点を持つ edge のスタイルと `direction` が、書いた edge にだけ効くようになる。それ以外の描画は変わらない
- 公開 API: `edgeKey` の出力が、`#` を含む端点で引用符付きになる
- ドキュメント更新: なし（`docs/spec/` は内部キーを定めていない）
- テスト・examples への影響: examples に `#` を含む端点の edge は無い（`examples/**/*.krs` を grep して 0 件）。実装 PR で examples の描画が変わらないことを `pnpm pr:shots` で確かめる
