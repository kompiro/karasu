# 同名ノードの per-node Map は path をキーにし、bare id の見え方は勝者規則 1 つで決める

- **日付**: 2026-10-08
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2934](https://github.com/kompiro/karasu/issues/2934)（[ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md) の再点検で切り出した残課題）
  - 隣接 Issue: [#2935](https://github.com/kompiro/karasu/issues/2935)（hand-over に path を運ぶ。エディタへジャンプ・ハイライト・deploy → system）, [#2933](https://github.com/kompiro/karasu/issues/2933)（静的バンドルの重複レベル）, [#2819](https://github.com/kompiro/karasu/issues/2819)（区切り文字で連結した path key の単射化）
  - 関連 ADR: [ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md)（`data-node-path` と `nodeMetadataByPath`。bare の `nodeMetadata` は互換のため last write のまま残した）, [ADR-2088](../adr/2088-node-reference-path-notation.md)（決定 4: 索引は path キー。bare id の揃った多重一致は意図的 broadcast）, [ADR-2550](../adr/2550-order-independent-node-path-index.md)（`nodePathIndex` の勝者は宣言順に依存しない）, [ADR-2714](../adr/2714-deploy-container-id-injective.md)（`nodePathRefId`。衝突したときだけ key を変える案の却下）, [ADR-2173](../adr/2173-facet-grammar-and-model.md)（`facetIndex` は 1:N、所属を捨てない）, [ADR-2174](../adr/2174-facet-overlay.md)（overlay は node id で引く）
  - 関連 TPL: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則を全 index で揃える）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元をキーに含める）, [TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（同じ canvas の重複要素 id は着地を名指す）, [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（宣言された所属を派生 index で捨てない）, [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生値の複製を持たない）
  - コード: `packages/core/src/compile/compile.ts`（`buildNodeMetadata`）, `packages/core/src/fs/import-resolver.ts`（`nodeFileIndex`）, `packages/core/src/resolver/style-resolver.ts`, `packages/core/src/renderer/facet-overlay.ts`, `packages/core/src/diff/view-diff.ts`, `packages/core/src/exporter/drawio/drawio-exporter.ts`

## 背景・課題

2 つの system が同じ bare id のノードを持つモデル（`Shop.Api` と `Admin.Api`）は言語上正当で
ある（ADR-2088、`docs/spec/syntax.md`「When to use path syntax」）。ADR-2917 でルートビューは
両方のカードを描くようになり、クリックはカードの `data-node-path` で自分のノードに着く。
しかし compile / render の途中で作る per-node の Map の多くは **bare id をキーにしたまま**で、
同名の 2 ノードのどちらを表すかを Map ごとに別の規則で決めている。

### 実測

AT-2917 のモデルに、2 つの `Api` を見分ける属性（tag・facet・annotation・description）を
足して測った（`main` = `dc23315a`、`packages/core/dist` を直接呼ぶスクリプト）。

```krs
facet pii { label "PII" }
system Shop {
  service Api [external] @migration_target {
    description "Shop's Api"
    facets pii
  }
  service Worker {}
  Api -> Worker "queues"
}
system Admin {
  service Api {
    description "Admin's Api"
  }
  service Jobs {}
  Api -> Jobs "runs"
}
```

| Map                                                        | 観測                                                                          | 何が起きているか                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeMetadata.get("Api")`                                  | description は `Admin's Api`、`viewPath` は `["Shop","Api"]`                  | **1 つのレコードの中で 2 つのノードが混ざる**。本体は後から書いた `Admin`、`viewPath` は `nodePathIndex` の勝者 `Shop`                                            |
| style（`service[external] { background-color: #ff0000 }`） | `Shop` を先に書くと**どちらも赤くない**、`Admin` を先に書くと**どちらも赤い** | `nodeStyles.set(node.id, …)` が後勝ちで、後から処理された方の解決結果が両カードに効く。tag 付きの `Shop.Api` だけが赤いのが正しい                                 |
| facet overlay（`pii` を選択）                              | 両カードに `data-facet-member="pii"`                                          | `facetIndex` は bare id で 2 ノードの所属を union する。`Admin.Api` は `pii` を宣言していない                                                                     |
| draw.io（system ページ）                                   | `system-Api` の cell id が 2 つ。edge は両方とも `source="system-Api"`        | 同じページに重複 id。どちらの edge がどのカードから出るか区別できない                                                                                             |
| diff 状態（ルートビュー）                                  | `Admin.Api` だけを追加・変更しても、ルートの `Admin.Api` カードは `unchanged` | ルートの slice は `systems[0]` の子しか diff しない。`Admin.Api` は bare id 経由で `Shop.Api` の状態を借りている（同名でない `Admin.Console` には状態が付かない） |
| `nodeFileIndex`                                            | 走査順で最初のファイル                                                        | `nodePathIndex` の勝者（`@migration_target`）とは別の規則                                                                                                         |

ADR-2917 の表と合わせると、同じ bare id について「詳細パネルは後の system、ドリルは勝者、
エディタへジャンプは最初の宣言、facet リングは両方の和」という 4 通りの答えが同時に出ている。
TPL-1583 は「1:1 index は主を選ぶ規則を全 index で揃える」と規定しており、これに反する。

### #2917 と #2935 との分担

- **#2917** は click 経路（カード → ドリル・詳細パネル）だけを path で引くようにした。
  `nodeMetadataByPath` はその受け皿で、bare の `nodeMetadata` は互換のために残した。
- **#2935** は bare id しか運ばない hand-over（エディタへジャンプ、ハイライト、アウトライン、
  deploy → system）に path を運ばせる。
- **本件（#2934）** は Map 側を扱う。カードを描く・塗る・状態を付けるときに、そのカードの
  ノード自身の値を引けるようにし、bare id でしか引けない消費側には 1 つの規則で答える。

## 現状（インベントリ）

| Map                                                      | 構築箇所                                                         | 今日の規則                                                            | 主な消費側                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `nodePathIndex`                                          | `parser/reference-validation.ts`（`buildNodePathIndex`）         | 勝者: `migrationPriority()` 優先、同点は宣言順（TPL-1583 / ADR-2550） | `nodeMetadata.viewPath`、permalink・hash の解決                                                                          |
| `nodeMetadata`                                           | `compile/compile.ts`（`buildNodeMetadata`、`map.set(id, meta)`） | 後勝ち（後の system）                                                 | app `PreviewPane`（path が無いときの fallback、詳細パネル）、VS Code webview（同上）、draw.io の `metadata.get(node.id)` |
| `nodeMetadataByPath`                                     | 同上                                                             | path ごとに 1 件（#2917）                                             | app / VS Code の click delegation                                                                                        |
| `nodeFileIndex`                                          | `fs/import-resolver.ts`（`indexNode`）                           | 先勝ち（merge 順）                                                    | app `useJumpToEditor`                                                                                                    |
| `ResolvedStyles.nodes` / `layoutHints` / `paintedColors` | `resolver/style-resolver.ts`（`processNodes`）                   | 後勝ち。annotation が違う場合だけ `id@annotation` の修飾 key で分ける | renderer `resolveNodeStyle`、layout の column hint                                                                       |
| `KrsFile.facetIndex`                                     | `parser/parser.ts`・`fs/import-resolver.ts`（`buildFacetIndex`） | bare id で union                                                      | `knownFacetIds`（facet id の列挙）、`resolveFacetOverlay`（リングの所属）、`compile-diff.ts`（before/after の所属統合）  |
| `nodeDiff` / `nodeDiffState`                             | `diff/view-diff.ts`（`diffNodeArray`）                           | 配列内で 1 件。ルートは `systems[0]` の子のみ                         | renderer `data-diff-state`、詳細パネルの diff 表示                                                                       |
| draw.io cell id                                          | `exporter/drawio/drawio-exporter.ts`（`cellId(node.id)`）        | bare id → 同ページで重複                                              | `.drawio` の構造（parent / source / target）                                                                             |

前提として使える道具はすでにある。

- `LayoutNode.path`（#2917）: 論理ビューの実 canvas ノードはすべて自分の full path を持つ。ghost と
  合成 stub は持たない。
- `nodePathRefId(path)` / `parseNodePathRefId`（ADR-2714 / ADR-2917）: 単射なテキスト形。
  `data-node-path` と `nodeMetadataByPath` の key がこれ。
- `nodePathIndex.get(id)`: 勝者の full path（`["Shop","Api"]`）。

## 制約・前提

- **同名 id を持たないモデルの出力は変えない。** SVG・draw.io・`CompileResult` の bare Map の中身は
  byte-identical に保つ（ADR-2521 の並列性の前提、既存 fence）。
- **bare の公開フィールドは型も意味も壊さない。** `CompileResult.nodeMetadata`、`KrsFile.nodeFileIndex`、
  `KrsFile.facetIndex` は `@karasu-tools/core` の公開面で、app / VS Code / 外部利用者が読む。
  #2917 が `nodeMetadata` を残したのと同じ扱いにする。
- **permalink の文法、要素の id（`data-node-id`）、hand-over の運ぶ値は変えない。** それぞれ
  ADR-425 / ADR-2917 / #2935 の範囲。
- **style selector の意味は変えない。** `#Api` が全 scope の `Api` に一致するのは仕様
  （`docs/spec/style.md`）で、本件はその一致の**結果をどこに保存するか**だけを扱う。
- **out of scope**:
  - ルートの diff が `systems[0]` 以外の子に状態を付けないこと。同名 id と無関係に起きる既存の欠落
    （上の `Admin.Console`）で、別 Issue に切る（「未解決の問い」）。
  - ghost と合成 stub の per-node 値。`LayoutNode.path` を持たないため、bare の見え方
    （下の勝者規則）で引く。
  - `ownerIndex` / `boundaryMembership` の key の単射化（#2819）。

## 判定の基準（1 つ）

**その Map を引く消費側が知りたいのは「この 1 ノード」の値か、「この id を持つノード全部」の値か。**

- **1 ノード**なら、Map は path をキーにする。bare id でしか引けない消費側のために bare の見え方を
  1 つ用意し、その entry は `nodePathIndex` の勝者規則で選ぶ（TPL-1583）。
- **id を持つノード全部**なら、それは broadcast であり、bare id のキーで union（または全件一致）して
  よい。その旨を Map の doc comment に書き、1 ノードを塗る・描く消費側には使わせない。

この基準を当てはめると、表の 1:1 の Map はすべて「1 ノード」側に入る。broadcast 側に残るのは
`facetIndex` の「model が知る facet id の列挙」だけである（下の案 C の表）。

## 検討した選択肢

### 案 A: すべての Map を path キーにし、bare の見え方は勝者規則で path から導く（Issue の選択肢 1）

各 Map を `nodePathRefId(path)` で key した primary に置き換え、bare id の Map は primary から
勝者を引いて作る派生ビューにする。描く・塗る消費側は `LayoutNode.path` で primary を引く。

**メリット**

- カードごとに自分の値が出る。style・facet・diff・draw.io の目に見える誤りが直る。
- bare id の答えが 1 つの規則（勝者）に揃う。詳細パネル・ドリル・jump-to-editor が同じノードを指す。
- ADR-2088 決定 4（索引は path キー）と ADR-2917 の `nodeMetadataByPath` と同じ形。

**デメリット**

- 変更箇所が 6 つの Map にまたがる。
- broadcast であるべきもの（facet id の列挙）まで勝者で間引くと、所属を捨てる（ADR-2173 / TPL-2161 違反）。

### 案 B: bare キーのまま、各 Map の tie-break を勝者に揃える（Issue の選択肢 2）

`map.set(id, …)` を「勝者なら上書き、そうでなければ先勝ち」に変える。

**メリット**

- 変更が小さい。公開面の型も値の形も変わらない。

**デメリット**

- **揃うだけで正しくならない。** ルートビューの `Admin.Api` カードは引き続き `Shop.Api` の style・
  facet リング・diff 状態で描かれる。実測の 4 つの目に見える誤りのうち、直るのは「レコードの中で
  2 ノードが混ざる」だけ。
- draw.io の重複 cell id は直らない（bare キーは 1 つの値しか持てない）。
- 「衝突しないときは正しく、衝突したら勝者の値で全カードを塗る」という説明は ADR-2917 の
  「bare id は集合を指す。1 ノードを指したい消費側は path を持つ」と逆向きになる。

### 案 C: 案 A を基本にし、broadcast の Map だけ bare の union を残して文書化する（Issue の選択肢 1 + 3）

上の判定基準で Map を 2 つに分ける。1 ノード側は案 A、broadcast 側は bare の union のまま
doc comment に「broadcast」と書く。

| Map                                                           | 区分                     | primary（1 ノード）                                            | bare の見え方                                                                     |
| ------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `nodeMetadata`                                                | 1 ノード                 | `nodeMetadataByPath`（既存）                                   | 勝者の entry（`viewPath` も勝者自身なので混ざらない）                             |
| `nodeFileIndex`                                               | 1 ノード                 | `nodeFileIndexByPath`（新設）                                  | 勝者の file                                                                       |
| style（`nodes` / `layoutHints` / `paintedColors`）            | 1 ノード                 | `ResolvedStyles.nodesByPath` ほか（新設、別 Map）              | 勝者の解決結果。`id@annotation` の修飾 key は ghost 用に残す                      |
| facet の所属（overlay のリング）                              | 1 ノード                 | `KrsFile.facetIndexByPath`（新設）                             | なし（リングは path で引き、path を持たない stub は畳み込み元の path から集める） |
| `facetIndex`（facet id の列挙・`[facets=]` 以外の集合の問い） | broadcast                | —                                                              | union のまま。doc comment に「1 ノードを塗る用途に使わない」と書く                |
| diff 状態                                                     | 1 ノード                 | `nodeDiffByPath`（新設）                                       | 勝者の状態                                                                        |
| draw.io cell id                                               | 1 ノード                 | layout の Map key（ルートは `nodePathIdentityKey([sys, id])`） | —                                                                                 |
| `nodePathIndex`                                               | 1 ノード（勝者そのもの） | —                                                              | 規則の出どころ。変えない                                                          |

**メリット**

- 案 A の正しさを持ちつつ、ADR-2173 の「所属を捨てない」を守る。
- 「broadcast は bare id、1 ノードは path」という読み方が、ADR-2088（揃った多重一致は broadcast）・
  ADR-2917（1 ノードを指したいなら path）・`docs/spec/style.md`（無修飾は全 scope）と同じになる。

**デメリット**

- 案 A と同じく変更箇所が多い。
- bare と path の 2 つの Map を持つ。ただし bare は primary から 1 つの helper で導く派生ビューにし、
  別々に構築しない（TPL-1032）。

## 比較

| 観点                                             | 案 A     | 案 B     | 案 C     |
| ------------------------------------------------ | -------- | -------- | -------- |
| カードが自分の値で描かれる（style・facet・diff） | ○        | ×        | ○        |
| draw.io の重複 cell id                           | 直る     | 直らない | 直る     |
| bare id の答えが 1 規則                          | ○        | ○        | ○        |
| facet 所属を捨てない（ADR-2173）                 | ×        | ○        | ○        |
| 同名なしモデルの出力                             | 不変     | 不変     | 不変     |
| 公開面の互換                                     | 追加のみ | 変更なし | 追加のみ |
| 変更量                                           | 大       | 小       | 大       |

## 現時点の方針

**案 C を採用する。** 案 B は「揃えるが誤ったまま」で、実測した目に見える誤りのうち 3 つ
（style・facet・diff）と draw.io の重複が残る。案 A は facet id の列挙のような本当の broadcast まで
勝者で間引いてしまう。判定基準を 1 つ（消費側が 1 ノードを問うか、id 全体を問うか）にして、
1 ノード側を path キー + 勝者規則の bare ビュー、broadcast 側を union + 文書化に分ける。

### bare の見え方の規則

bare id で引く entry は、**その Map が保持している同じ bare id の entry のうち、path が
`nodePathIndex.get(id)` と一致するもの。一致するものが無ければ Map に最初に入ったもの**とする。

- 一致するものが無いのは、勝者がそのビューに居ないとき（`Shop` に潜ったビューで勝者が `Admin.Api`）
  である。そのビューの論理 canvas には同名の兄弟は居ない（id は兄弟間で一意。ADR-927）ので、
  候補は canvas の 1 件と ghost に限られ、最初に入るのは canvas の 1 件になる。
- 規則は core に helper を 1 つ置いて全 Map で共有する（例: `bareIdView(byPath, nodePathIndex)`）。
  Map ごとに書き下さない（TPL-1583「三項のコピペ」）。

### 実装の指針

1 PR で入れる（各 Map の変更は小さく、共有 helper と AT が全 Map にまたがるため）。

1. **helper**: `parser/node-path.ts` か新設の `compile/bare-id-view.ts` に、path キーの Map から bare
   の見え方を作る関数を置く。入力は `Map<nodePathRefId, V>` と `nodePathIndex`、出力は `Map<id, V>`。
   path の末尾 segment は `parseNodePathRefId` で取り出す（key を `.` で split しない。#2819 /
   TPL-1352）。
2. **`nodeMetadata`**: `buildNodeMetadata` は `byPath` だけを組み立て、`byId` は helper で導く。
   draw.io の `metadata.get(node.id)` は node の path があれば `byPath` を引く。
3. **`nodeFileIndex`**: `import-resolver.ts` の `indexNode` は path を辿りながら
   `nodeFileIndexByPath` を作る。bare の `nodeFileIndex` は `resolve()` が `nodePathIndex` を
   再構築した後に helper で導く（ADR-2596 と同じ位置）。app の jump は #2935 で path を運ぶまで
   bare を引く（勝者に着く）。
4. **style**: `processNodes` に祖先 path を渡し、`nodesByPath` / `layoutHintsByPath` /
   `paintedColorsByPath` を別 Map として持つ（bare id と `nodePathRefId` は同じ文字列になりうる。
   引用符付き id `"Shop.Api"` の bare key と path `Shop.Api` が衝突するので、同じ Map に混ぜない）。
   `resolveNodeStyle` は `layoutNode.path` があれば path を先に引き、無ければ今の順
   （`id@annotation` → bare）。bare は helper で勝者を入れる。layout の column hint も同じ順。
5. **facet**: `buildFacetIndex` と並べて `facetIndexByPath` を作る。`resolveFacetOverlay` の
   `membership` を path キーにし、renderer の `facetsFor` は `layoutNode.path` で引く。
   `foldFacetMembership` は畳み込まれるノードの path で集める。`compile-diff.ts` の所属統合も path で
   行う。bare の `facetIndex` は union のまま、doc comment の「overlay slice も同じ要件を持つ」を
   「overlay は `facetIndexByPath` を引く。本 Map は broadcast（facet id の列挙）専用」に書き換える。
6. **diff**: `diffNodeArray` に canvas の path prefix を渡し、`nodeDiffByPath` を併せて作る。renderer は
   `layoutNode.path` があれば path を先に引く。ルートの `Admin.Api` は `Shop.Api` の状態を借りなくなる
   （`systems[0]` 以外に状態が付かない既存の欠落は残る。別 Issue）。
7. **draw.io**: cell id を layout の Map key から作る（`nodeIdentity` と同じ考え方）。ルートの edge の
   source / target を引けるよう、`layoutMultipleSystems` が `LayoutEdge` に端点の Map key
   （`fromKey` / `toKey`、ルートでだけ設定）を載せ、exporter は無ければ bare id に落ちる。
   同名なしモデルでは Map key が bare id と同じなので出力は変わらない。
8. **tests**: `packages/core/src/renderer/multi-system-same-id.test.ts` に上の実測モデルで Map ごとの
   規則を固定する。宣言順を入れ替えても結果が変わらないこと（TPL-1583 チェックリスト最終項）を
   各 Map で確かめる。同名なしモデルの byte-identical は既存の fence が見る。
9. **TPL**: TPL-1583 の `discovered_from` に `#2934` を足し、チェックリストに「bare id の Map を
   足すときは、1 ノードの値なら path キー + 勝者規則の bare ビュー、broadcast なら doc comment に
   そう書く」を 1 項足す。新規 proactive TPL は起こさない（原則は TPL-1583 / TPL-1352 / TPL-2920 に
   既にある）。
10. **spec**: `docs/spec/diagnostics.md` の `node-id-multiple-locations` 節（ADR-2917 が着地点を
    追記した場所）に「bare id で引く値（詳細パネルの fallback・jump-to-editor）は勝者のノード」を
    書き足す。
11. **AT**: `docs/acceptance/2934-same-id-per-node-maps.md` を新設する。TC は:
    - 実測モデルのルートビューで、tag 付き `Shop.Api` のカードだけが style の色を持つ（宣言順を
      入れ替えても同じ）
    - `pii` を選ぶと `Shop.Api` のカードだけがリングを持つ
    - `nodeMetadata.get("Api")` の description と `viewPath` が同じノード（勝者 `Shop`）のもの
    - draw.io の system ページで cell id が一意で、`Api -> Worker` と `Api -> Jobs` がそれぞれ自分の
      system の `Api` cell から出る
    - before / after で `Admin.Api` だけを変えたとき、ルートの `Shop.Api` は状態を変えず、`Admin.Api`
      は `Shop.Api` の状態を借りない
    - 手動: 実測モデルを `karasu render --format drawio` した `.drawio` を draw.io で開くと、`Shop` と
      `Admin` の枠にそれぞれ `Api` が 1 つずつあり、各 `Api` から自分の system の edge が出ている
      （重複 cell id を draw.io がどう読むかは自動テストでは確かめられない）
12. **ADR 昇格**: 実装完了後 `docs/adr/2934-same-id-per-node-maps.md` として昇格し、本 Design Doc は
    同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同名 id を持たないモデルは不変。同名 id を持つモデルは、ルートビューの
  カードがそれぞれ自分の style・facet リング・diff 状態で描かれ、draw.io export の system ページが
  正しい親子と edge を持つ。bare id の詳細パネル（path が無いときの fallback）は後の system ではなく
  勝者のノードを出す。
- 公開面: `CompileResult` / `KrsFile` / `ResolvedStyles` に path キーの Map が増える（追加のみ）。
  bare の Map は残り、同名 id のときの値が「後勝ち / 先勝ち」から「勝者」に変わる。changeset は
  `@karasu-tools/core` の patch。
- ドキュメント更新: `docs/spec/diagnostics.md`（`node-id-multiple-locations`）、
  `packages/core/src/types/ast.ts` の `facetIndex` / `nodeFileIndex` の doc comment。
- テスト・examples への影響: `examples/` に同名 id のモデルは無い（ADR-2917 で確認済み）。

## 未解決の問い / 決めないこと

- **ルートの diff が `systems[0]` 以外の子に状態を付けない**ことは別 Issue に切る。同名 id と
  無関係な既存の欠落で、#2756 が edge 側について同じ形（frame ごとに diff する）で直した。本件の
  path キー化はその修正の前提になる（system ごとの子を同じ Map に入れても潰れない）。
- **ghost と合成 stub に path を持たせるか**は決めない。ADR-2917 が `data-node-path` を出さないと
  決めた対象で、bare の勝者規則で引く。ghost の `Admin.Api` が service ビューに出て、勝者が
  `Shop.Api` のとき、その ghost は `Shop.Api` の style で描かれる（今日の後勝ちでも同じ種類の
  取り違えが起きている）。実害が観測されたら別 Issue で扱う。
- **jump-to-editor・ハイライト・アウトライン**が path を運ぶのは #2935。本件の後は、bare id で
  運ぶ限り勝者に着く（今日の「走査順で最初」から変わる）。
