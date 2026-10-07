# node path と edge の identity キーを injective にする

- **日付**: 2026-10-07
- **ステータス**: 検討中
- **PR**: #3092
- **関連**:
  - 引き金 Issue: [#2819](https://github.com/kompiro/karasu/issues/2819)
  - 関連 ADR: [ADR-2714](../adr/2714-deploy-container-id-injective.md)（deploy コンテナ id を `nodePathRefId` で injective にした前例。本 Issue はその残課題）, [ADR-2088](../adr/2088-node-reference-path-notation.md)（`ownerIndex` / `boundaryMembership` を full path キーにした決定。エンコードは定めていない）, [ADR-2547](../adr/2547-shared-node-path-machinery.md)（`nodePathKey` を含む node path の共有機構）, [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（scope キーを JSON で injective にした前例）, [ADR-2756](../adr/2756-root-view-system-edge-ownership.md)（edge diff キーに system が無いことへの per-frame 対処）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  - コード: `packages/core/src/parser/node-path.ts`, `packages/core/src/parser/reference-validation.ts`, `packages/core/src/diff/view-diff.ts`, `packages/core/src/diff/deploy-view-diff.ts`, `packages/core/src/diff/org-view-diff.ts`

## 背景・課題

いくつかの索引とキーが、node path（または edge の両端）を区切り文字で 1 本の文字列に join し、その文字列を identity として使っている。区切り join は injective ではないので、別々の要素が 1 つのキーに落ちる。#2714 は deploy コンテナ id についてこれを直した（ADR-2714）。同じ壊れ方が残り 3 箇所にある。

### 1. `ownerIndex`: owner が消え、誤った診断が出る

```krs
system Shop { service Api {} }
service "Shop.Api" {}
organization Acme {
  team Alpha { owns Shop.Api }
  team Beta { owns "Shop.Api" }
}
```

別々のノードを別々の team が owns している。main（22e6a24e）での実測:

```
ownerIndex [ [ 'Shop.Api', 'Alpha' ] ]
diags [ 'duplicate-owner-assignment' ]
```

Beta によるトップレベル service の所有が消え、`duplicate-owner-assignment` が「1 つのノードを 2 つの team が owns している」と誤って報告する。`ownerIndex` / `boundaryMembership` / `teamOwnership` はいずれも `nodePathKey`（`segments.join(".")`）をキーにしているので、`["Shop", "Api"]` と `["Shop.Api"]` が衝突する。

### 2. org ビューの owned-service ボタン

```krs
system Shop { service Api {} }
service "Shop.Api" {}
organization Acme {
  team Core {
    owns Shop.Api
    owns "Shop.Api"
  }
}
```

main での実測で、org SVG に `data-owned-service-button="Shop.Api"` を持つボタンが 2 つ出る。diff state も `ownsEdgeKey(team, nodePathKey(ref))` で 1 つのキーになる。どちらをクリックしても同じ場所へ遷移する。

### 3. edge の diff キー

`diffGhostEdges` は edge を `${from}->${to}` でキーにする。before に `a → "b->c"`、after に `"a->b" → c` がある diff は、1 本の `a->b->c: unchanged` を報告し、削除された edge は合成ビューから消える。

Issue 本文は「`->` を含む id は quote なしで書ける」としているが、lexer の識別子は `[\p{L}\p{N}_]` なので `->` を含む id は quoted id でしか書けない。ただし quoted id は受理済みの構文で、`service "b->c"` は `.`・`"`・`\` を含まないので deploy コンテナ id も `b->c` のまま出る（ADR-2714 の規則）。上流で防ぐものはなく、症状には到達できる。

さらに、このキーは deploy 専用ではない。system ビューの diff（`view-diff.ts` の `edgeKey`）も同じ `${from}->${to}` を使い、`svg-renderer.ts` の `edgeDiffState` 参照・`group-collapse.ts`・`layout.ts` の frame 参照がこの形を組み立てて引く。system ビューでも quoted id で同じ衝突に到達する。

### 記録されたトレードオフの前提が変わった

`nodePathKey` の docstring は、索引が素の join を使う理由を次のように記録している。

> JSON keying would be injective but would break consumers that already hold a dotted qualified id as their node key, so the renderer's existing convention wins.

#2714 が足した `nodePathRefId` は injective で、かつ `.`・`"`・`\` を含まず空でもないセグメントだけの path に対しては素の join と同じ文字列を出す。injective なキーにしても dotted の慣習を壊さずに済むので、この前提はもう成り立たない（ADR-2714「残課題」でも #2819 に送っている）。

## 現状（インベントリ）

### path キーの索引（site 1）

| 役割                        | 場所                                                                                                                   | 現在のキー                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 書き込み                    | `reference-validation.ts` の `buildOwnerIndex` / `buildTeamOwnership` / `buildBoundaryMembership`                      | `nodePathKey`                                            |
| 読み取り（canvas への射影） | `layout-grouping.ts` の `projectPathIndexOntoCanvas`                                                                   | prefix を `startsWith` で外し、残りに `.` があれば捨てる |
| 読み取り（owner 解決）      | `layout.ts` の `canvasOwnerOf` / `frameOwnerOf`、`ghost-layout.ts`、`compile.ts:816`、`compile-diff.ts` の `diffKeyOf` | `nodePathKey`                                            |
| 読み取り（team 依存）       | `team-dependency-extract.ts` の `resolveOwners` / structural overlap、`unowned` map                                    | `nodePathKey`                                            |
| 読み取り（app）             | `packages/app/src/hooks/useChatSession/prompt.ts` の `serializeNode`                                                   | `path.join(".")`                                         |

`projectPathIndexOntoCanvas` は、残りに `.` を含むキーを「別の深さのエントリ」として捨てる。このため root canvas のトップレベル `service "Shop.Api"` は、team / boundary の grouping から黙って外れる。Issue に無い、同じ原因の 4 つ目の症状である。

### owns の参照キー（site 2）

| 役割        | 場所                                                                                             | 現在のキー                                  |
| ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| SVG 属性    | `org-renderer.ts` の `data-owned-service-button`、`org-tree-renderer.ts` の `data-owned-service` | `nodePathKey(ref)`                          |
| diff        | `org-view-diff.ts` の `ownsEdgeKey` と `diffOwns` の `beforeSet` / `seen`                        | `${teamId}#owns#${nodePathKey(ref)}`        |
| 遷移（app） | `useCrossNavigation.ts` の `handleOwnedServiceClick`                                             | 属性値を bare id として `nodePathIndex.get` |

`handleOwnedServiceClick` は属性値を bare id として引くので、`owns Shop.Api` のような修飾参照は今も遷移先を引けない（`nodePathIndex` に `"Shop.Api"` というキーは無い）。

### edge の diff キー（site 3）

| 役割     | 場所                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 書き込み | `view-diff.ts` の `edgeKey`、`deploy-view-diff.ts` の `diffGhostEdges`                                                                                                     |
| 読み取り | `svg-renderer.ts` の `effectiveEdgeDiffState.get(edgeKey)`、`group-collapse.ts` の `renderKey` と `edgeDiffState.get`、`layout.ts:1372` の `systemFrame.edgeDiffState.get` |

`svg-renderer.ts` の同じ `` `${from}->${to}` `` は `styles.edges` の参照にも使われている。こちらは `.krs.style` の edge セレクタが作る style キーで、diff キーとは別の契約である。

## 制約・前提

- **普通のモデルではキーを 1 つも変えない。** `.`・`"`・`\` を含まず空でもない id だけでできたモデル（edge キーでは、さらに `->` を含まないモデル）では、索引のキー・SVG 属性・diff キーがすべて今と同じ文字列であること。e2e の `data-owned-service-button="Catalog"` などのセレクタと、diff キーを直書きしている多数のテストをそのまま通す
- **書き込みと読み取りは同じヘルパーを通す**（TPL-1352）。キーを分解する読み手は、文字列操作ではなくエンコーダの逆関数を使う
- **out of scope**:
  - `ghost-layout.ts` の ghost ノード id（`layoutNodes` のキー）。Issue で到達するモデルを作れなかったもの。ただし同じファイルの owner 解決は索引を引くので、site 1 として変える
  - `styles.edges` の `${from}->${to}` style キー。`.krs.style` のセレクタとの契約で、diff キーとは別物
  - 診断の params（`duplicate-owner-assignment` の `nodeId` など）。メッセージ用の text で、identity ではない
  - `owns Shop.Api` のような修飾参照の遷移を、`nodePathIndex` の勝者以外まで正しく解決すること（下の「現時点の方針」の遷移規則で、勝者が一致する場合だけ改善する）

## 検討した選択肢

### path キー（site 1・2）

#### 案A: `nodePathRefId` をキーにする

索引のキー、owns ボタンの属性値、`ownsEdgeKey` の ref 部分を `nodePathRefId` に揃える。キーを分解する読み手（`projectPathIndexOntoCanvas`、app の遷移）は `parseNodePathRefId` で segments に戻す。

**メリット**

- injective。分解の仕方が 1 通りに決まる（ADR-2714 で検証済み）
- `.`・`"`・`\` を含まず空でもないセグメントだけの path では素の join と同じ文字列なので、普通のモデルではキーも SVG 属性も変わらない
- deploy コンテナ id と同じエンコードになる。修飾コンテナ id と索引のキーが同じ値で突き合わせられる

**デメリット**

- dotted / quoted id を持つモデルでは、`→ "Shop.Api"` のように表示とキーに引用符が付く
- 読み手が文字列の prefix 一致でキーを割っていた箇所は、逆関数に書き換える必要がある

#### 案B: `nodePathIdentityKey`（JSON）をキーにする

**メリット**

- 常に injective で、実装が単純

**デメリット**

- すべてのモデルでキーが JSON になる。`data-owned-service-button` の値、app の `prompt.ts`、diff キーを直書きしたテストがすべて変わる。docstring が却下理由に挙げた「dotted の慣習を壊す」がそのまま当てはまる。ADR-2714 も同じ理由でコンテナ id に JSON を採らなかった

#### 案C: 衝突を観測したときだけ引用符で囲む

ADR-2714 が却下した案と同じ。囲んだ後の形がさらに別ノードのキーと一致しうるので、injective にするには再判定を繰り返す必要がある。キーがモデル内容に 2 つ目の経路で依存する。

### edge の diff キー（site 3）

#### 案D: 曖昧にする端点だけ引用符で囲む（`edgeKey` を共有ヘルパーにする）

既存の `edgeKey(edge)`（core の index から export 済み）の実装を差し替え、端点が `->`・`"`・`\` のいずれかを含むときだけ `.krs` の文字列リテラル形（`quotedIdLiteral`）にしてから `->` で join する。書き込み 2 箇所と読み取り 3 箇所をすべてこのヘルパーに通す。

injective である理由: 囲まない端点は `->` を含まず `"` で始まらない。区切りの `->` は自分自身と重ならない（`-` で始まり `>` で終わるので、末尾と先頭が一致する部分がない）。したがって `from` が bare なら最初の `->` が区切りで、`"` で始まるならリテラルの終わりの直後が区切りになり、分解は 1 通りに決まる。

**メリット**

- `->`・`"`・`\` を含まない端点の edge はキーが今と同じ。diff キーを直書きしている既存テストが変わらない
- system ビューと deploy ビューを同時に直す。キーの組み立てが 1 箇所に集まるので、次に読み手が増えても形がずれない
- `nodePathRefId` と同じ「曖昧にする部分だけ囲む」規則で、ADR-2714 と考え方が揃う

**デメリット**

- deploy コンテナ id は `nodePathRefId` の結果なので、`"www.example.com"` のように既に `"` を含むことがある。その端点は二重に囲まれる（`"\"www.example.com\""`）。キーは内部専用で外に書き出されないので、読みにくさは問題にならない

#### 案E: NUL 区切り（`${from}\u0000${to}`）

`extractDeployView` の局所 dedup キーと同じ形。

**デメリット**

- すべての edge キーが変わり、diff キーを直書きしたテストが大量に書き換わる
- quoted id の文字列リテラルが NUL を含みうるかを別途確かめる必要があり、injective である根拠が lexer の挙動に依存する

#### 案F: deploy だけ layout で edge に diffState を載せる

#2756 が multi-system root で採った方式（`edgeLayout.diffState`）を deploy に当てる。

**デメリット**

- system ビューの同じ衝突が残る。キーの組み立てが分散したままで、TPL-1352 の「書き込みと読み取りで同じヘルパー」を満たさない

### `ownsEdgeKey` の team 側

`${teamId}#owns#${ref}` は ref を injective にしても、team id が `#` を含むと衝突しうる。区切り `#owns#` は先頭と末尾がともに `#` で自分自身と重なるので、team id `a#owns` と ref `owns#x`（キー `a#owns#owns#x`）は team id `a` と ref `owns#owns#x` と同じ文字列になる。team id が `#`・`"`・`\` を含むときだけリテラル形で囲めば、案D と同じ理由で injective になる。

## 比較

| 観点               | 案A                    | 案B                                      | 案C                      |
| ------------------ | ---------------------- | ---------------------------------------- | ------------------------ |
| injective          | はい                   | はい                                     | 反復しないと保証できない |
| 普通のモデルのキー | 変わらない             | すべて JSON になる                       | 変わらない               |
| 前例               | ADR-2714 のコンテナ id | ADR-2036 の scope キー（外に出ないキー） | ADR-2714 で却下          |

| 観点                  | 案D            | 案E            | 案F          |
| --------------------- | -------------- | -------------- | ------------ |
| system ビューも直るか | はい           | はい           | いいえ       |
| 既存テストの書き換え  | ほぼなし       | 多数           | 少ない       |
| キーの組み立て箇所    | 1 つのヘルパー | 1 つのヘルパー | 分散したまま |

## 現時点の方針

**path キーは案A（`nodePathRefId`）、edge の diff キーは案D（曖昧にする端点だけ囲む共有ヘルパー）を採る。`ownsEdgeKey` の team 側も同じ規則で囲む。**

普通のモデルではキーが 1 つも変わらないまま、どのモデルでも injective になる。`nodePathRefId` は deploy コンテナ id で既に使っているエンコードなので、新しい形を増やさずに済む。edge キーは端点の文字集合が path と違う（区切りが `->`）ので、同じ「曖昧にする部分だけ囲む」規則を別のヘルパーにする。

### 実装の指針

1. **path キーの索引**: `buildOwnerIndex` / `buildTeamOwnership` / `buildBoundaryMembership` のキーを `nodePathRefId` にする（未解決の参照を「書かれたとおり」に残すキーも同じ）。読み手を合わせる:
   - `layout.ts` の `canvasOwnerOf` / `frameOwnerOf`、`ghost-layout.ts` の owner 解決（`layoutNodes` のキーは `nodePathKey` のまま）、`compile.ts:816`、`compile-diff.ts` の `diffKeyOf`
   - `projectPathIndexOntoCanvas` はキーを `parseNodePathRefId` で segments に戻し、`scopePath` と segment 単位で比べて、長さが `scopePath.length + 1` のものだけを残す
   - `team-dependency-extract.ts` の `resolveOwners`、structural overlap の lookup、`unowned` map のキー、`couldBeOwned` の path 比較。出力の `path` / `fromPath` / `toPath` / `insidePath` も同じ形にして、`"Shop.Api"` と `Shop.Api` を読み分けられるようにする
   - app の `prompt.ts` は `path.join(".")` をやめて core の `nodePathRefId` を使う（core の index から export されていなければ足す）
   - `nodePathKey` の docstring から索引の話を外し、「text 専用。identity には `nodePathRefId` か `nodePathIdentityKey`」に書き換える
2. **owns ボタン**: `org-renderer.ts` / `org-tree-renderer.ts` の属性値と表示テキストを `nodePathRefId(ref)` にする（表示は `→ Shop.Api` と `→ "Shop.Api"` になり、作者の書いた形に近くなる）。`org-view-diff.ts` の `ownsEdgeKey` と `diffOwns` の集合も同じキーにする
3. **app の遷移**: `handleOwnedServiceClick` は属性値を `parseNodePathRefId` で segments に戻す。highlight の id は最後の segment、遷移先は `nodePathIndex.get(最後の segment)` が segments を接尾辞として満たすとき（`nodePathMatchesSuffix`。core の index から export されていなければ足す）だけ使う。bare id 1 つの参照は今と同じ動きになり、`owns Shop.Api` は勝者が `Shop.Api` のとき新たに遷移できる
4. **edge の diff キー**: `view-diff.ts` の `edgeKey` を案D の形に差し替え（名前と signature は公開 API なので保つ）、`deploy-view-diff.ts`・`group-collapse.ts`・`svg-renderer.ts` の diff 参照（style 参照は除く）・`layout.ts:1372` をすべて通す。`DiffedDeployView.edges` などの docstring の「keyed `${from}->${to}`」も直す
5. **テスト**: Issue の 3 つのモデルと、`projectPathIndexOntoCanvas` が root のトップレベル `service "Shop.Api"` を grouping に入れることを regression test にする。`edgeKey` と `ownsEdgeKey` は injectivity（境界をずらした 2 組が別キーになる）と、普通の id で今と同じ文字列になることをテストする
6. **TPL-1352**: 「キーを分解する読み手はエンコーダの逆関数を使う（文字列の prefix 一致や `includes(".")` で割らない）」をチェックリストに足し、本 Issue を `discovered_from` に追記する
7. **AT**: `docs/acceptance/` に新規ファイル。人手で確かめる項目は 1 つ:
   - app で site 2 のモデルを開き、org ビューの 2 つのボタン（`→ Shop.Api` / `→ "Shop.Api"`）がそれぞれ自分のノードへ遷移する
8. **ADR 昇格**: 実装完了後、`docs/adr/2819-injective-node-path-keys.md` として昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- `.`・`"`・`\` を含まず空でもない id だけのモデル: 索引キー・SVG 属性・diff キーは変わらない
- dotted / quoted id のノードを owns / contains するモデル: 別々のノードの owner・boundary が別々に保たれ、誤った `duplicate-owner-assignment` / `duplicate-boundary-assignment` が消える。root canvas のトップレベル dotted id ノードが team / boundary の frame に入るようになる。owns ボタンの表示と属性に引用符が付く
- `->` を含む quoted id の edge を持つモデルの compare: 別々の edge が別々の diff state を持つ
- ドキュメント更新: `docs/spec/` の変更はない（キーは内部表現で、構文と表示規則は変わらない）。TPL-1352 を更新する
- テスト・examples への影響: examples に dotted / quoted id の owns は無い想定（実装時に `examples.test.ts` の snapshot で確かめる）
