---
id: ADR-3480
title: edge の canonical id（base form）は `.krs.style` で読み戻せる形にする
status: accepted
date: 2026-11-07
topic: edges
related_to:
  - ADR-1096
  - ADR-1142
  - ADR-2714
  - ADR-2088
scope:
  packages: [core, i18n, app]
assumptions:
  - "symbol: packages/core/src/style/edge-endpoint-literal.ts :: styleEndpointLiteral"
  - "symbol: packages/core/src/style/edge-endpoint-literal.ts :: edgeBaseForm"
  - "grep: packages/core/src/resolver/canonical-id.ts :: edgeBaseForm\\(edge\\.from"
  - "grep: packages/core/src/parser/style-parser.ts :: edgeBaseForm\\(first\\.value"
  - "symbol: packages/core/src/parser/style-parser.ts :: parseEdgeEndpoint"
  - "grep: packages/core/src/style/serialize.ts :: styleEndpointLiteral\\(selector\\.edgeFrom\\)"
  - "file: docs/acceptance/3480-edge-canonical-id-quoted-endpoints.md"
  - "file: docs/test-perspectives/TPL-3480-generated-id-relexes-in-target-grammar.md"
---

# ADR-3480: edge の canonical id（base form）は `.krs.style` で読み戻せる形にする

- **日付**: 2026-11-07
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3480](https://github.com/kompiro/karasu/issues/3480)（#3111 から分離）
  - PR: [#3526](https://github.com/kompiro/karasu/pull/3526)（Design Doc）, [#3614](https://github.com/kompiro/karasu/pull/3614)（実装）
  - 前提 Issue: [#3520](https://github.com/kompiro/karasu/issues/3520)（hex 形の selector id が色として読まれる。PR [#3606](https://github.com/kompiro/karasu/pull/3606) で先に修正）
  - 後続 Issue: [#3481](https://github.com/kompiro/karasu/issues/3481)（`styles.edges` のキーの衝突）, [#3523](https://github.com/kompiro/karasu/issues/3523)（`.krs.style` の文字列が `\n` を解釈しない）, [#3524](https://github.com/kompiro/karasu/issues/3524)（app の rule 走査が引用符を見ない）, [#3613](https://github.com/kompiro/karasu/issues/3613)（文字列の値の範囲が閉じ引用符の手前で終わる）
  - 関連 ADR: [ADR-1096](./1096-edge-id-selector.md)（`edge#<id>` セレクタと base form の決定。本決定はその書き方を補う）, [ADR-1142](./1142-gui-style-inplace-update.md)（GUI が `.krs.style` に rule を書き戻す経路）, [ADR-2714](./2714-deploy-container-id-injective.md)（曖昧にする部分だけ引用符で囲む前例）
  - 関連 TPL: [TPL-3480](../test-perspectives/TPL-3480-generated-id-relexes-in-target-grammar.md), [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-1755](../test-perspectives/TPL-1755-edge-endpoint-selector-id-form.md)
  - AT: [3480-edge-canonical-id-quoted-endpoints](../acceptance/3480-edge-canonical-id-quoted-endpoints.md)

## 背景

edge の canonical id は、著者 id（`.krs` の `#<id>`）が無ければ base form `<from><arrow><to>` になる（ADR-1096）。base form は 2 か所で使われる。

- `.krs.style` の `edge#<id>` セレクタが、この文字列と一致する edge に当たる
- SVG の `data-edge-canonical-id` に載り、app の右クリックメニューが `edge#${canonicalId} { direction: ... }` をそのまま `.krs.style` に書き込む（`upsertEdgeDirectionRule`）

base form は端点の文字列を素のまま繋いでいた。端点は quoted id なら任意の文字列を取れるが、`edge#` の端点は `.krs.style` の識別子しか読めなかった。この食い違いで次の 3 つが起きていた。

1. **識別子でない端点の edge に rule が書けない。** `"a b" -> c` の canonical id は `a b->c` で、app が書き込む `edge#a b->c { ... }` は parse エラーになり、どの edge にも当たらない。右クリックで方向を選んでも何も起きず、壊れた rule がファイルに残る。
2. **別々の edge が同じ base になる。** `"a->b" -> c` と `a -> "b->c"` はどちらも base が `a->b->c` になり、ADR-1096 の規則どおり `ambiguous-edge-base` が出て canonical id が外れる。警告は同じ base を共有する edge に識別する `#<id>` が無いと指摘するが、2 本は端点が違う。
3. **末尾が `-` の端点が async の base と重なる。** `"a-" -> c`（sync）の base は `a-->c` で、`a --> c`（async）の base と同じ文字列になる。`.krs.style` の lexer は `a-` を 1 つの識別子として読むので、端点を単独で読ませても検出できない。

いずれも、base form が `.krs.style` の lexer で読み戻せる形になっていないことが原因である。#2819 / #3111 で入れた `edgeKey` は内部キー用で、`->`・`"`・`\` を含む端点だけを囲む。空白や末尾の `-` は囲まないので、`.krs.style` に書く文字列にはそのまま使えない。

## 決定

base form の各端点は、`.krs.style` で読み戻して同じ値になる下の 3 条件を満たすならそのまま出し、満たさなければ `.krs` と同じ文字列リテラルで囲み、`edge#` セレクタも同じヘルパーで組み直す。

端点を囲まずに出す条件は 3 つで、1 つでも満たさなければ囲む（`styleEndpointLiteral`）。

1. `StyleLexer` で端点だけを tokenize して、ちょうど 1 つの `Identifier` が端点と同じ値で返る
2. 末尾が `-` でない。矢印の手前に置くと `-` が矢印に吸われるため。from と to のどちらに置くかをヘルパーが知らなくて済むよう、to の端点にも同じ条件を当てる
3. 先頭が `#` でない。`#abc` は単独なら色トークン（値が `#abc` の `Identifier`）として条件 1 を通るが、それは色であって識別子ではない

`.krs` の bare word（`isBareWord`）は 3 条件を必ず満たすので、lexer を通さずにそのまま返す。ほとんどの id がこの経路を通る。

hex 形の端点（`face`・`Feed.Items`）は囲まない。読めなかったのは端点の形ではなく `edge#` の直後の読み方の問題で、#3520 で直した。

| edge | base form |
| --- | --- |
| `"a b" -> c` | `"a b"->c` |
| `a -> "b->c"` | `a->"b->c"` |
| `"a->b" -> c` | `"a->b"->c` |
| `"a-" -> c` | `"a-"->c` |
| `PlaceOrder -> OrderDB.OrderTable` | 今までと同じ |

セレクタの扱いは次のとおりである。

- **`edge#`**: 端点に文字列リテラルと `#` で始まる値（`edge#a->#db`）も受け付け、`edgeBaseForm` で組み直す。`edge#"a"->c` は `edge#a->c` に、`edge#a- -> c` は `edge#"a-"->c` に正規化される
- **著者 id**: 著者 id と base form は名前空間を共有する。著者 id は識別子なので矢印を含まず、base form は必ず矢印を含む。この区別を崩さないよう、矢印の無い 1 トークンは今までどおり識別子だけを受け付け、`edge#"a b"` はエラーにする
- **`edge[from=]` / `edge[to=]`**: 値に文字列リテラルを受け付け、引用符を外した値を端点と比べる。`serialize.ts` は `styleEndpointLiteral` を通して書き戻すので、`karasu fmt` の往復で値が変わらない。空文字列（`[from=""]`）も落とさない

base form を表示する箇所（facet 監査行の id、`facet-not-declared` の subject、`ambiguous-edge-base` の警告）も同じ形を出す。警告の params には `base` を足した。

## 理由

- **canonical id は `.krs.style` に書かれることが前提の文字列である。** 「`.krs.style` の lexer で読み戻して同じ値になる」ことを base form の条件にすれば、問題 1〜3 が同じ規則で消える
- **判定を lexer に任せる。** lexer の規則（`-`・`.`・非 ASCII・数値・黙って捨てる記号）を別に書き写さないので、lexer が変わっても判定がずれない（bare word の近道だけは、bare word が 3 条件を満たすという前提に依る）。書き出す側と読む側が同じヘルパーを通る（TPL-1352）
- **普通のモデルでは id が変わらない。** 3 条件を満たす端点は囲まれないので、`data-edge-canonical-id` と既存の `.krs.style` はそのまま動く。囲まれる edge の `edge#` rule はもともと parse できなかったので、壊れる rule はほぼ無い（下の「影響」）
- **injective になる。** 囲まない端点は `#` で始まらず、`"` も `->` も含まず、`-` で終わらない。base form の先頭が `"` なら from は閉じ引用符で終わり、そうでなければ矢印を始める最初の `-` の手前で終わる。矢印の種類もその位置で決まり、残りが to になる
- **ADR-1096 の規則を保つ。** 本当に重なる edge は今までどおり警告して canonical id を外す。tie-break・index・hash は入れない
- **`.krs` と同じ書き方である。** 作者が `.krs` に書いた形と見た目が揃い、ADR-2714 の「曖昧にする部分だけ囲む」と同じ考え方になる

判定を単独の端点で行うと、位置による読み方の違いを見落としうる（条件 2 と #3520 はその見落としだった）。そのため判定の正しさは、生成した端点の組を `edge#<base>` に埋めて parse し直す性質テストで押さえる（`edge-endpoint-literal.test.ts`、TPL-3480）。

## 影響

端点がすべて 3 条件を満たすモデルでは何も変わらない。変わるのは次のとおりで、changeset に書いた。

- 3 条件を満たさない端点を持つ edge の canonical id、`data-edge-canonical-id`、`edgeBaseId` の出力に引用符が付く
- `edge#a-->c` は sync の `"a-" -> c` に当たらなくなる（`edge#"a-"->c` と書く）。空白入りの `edge#a- -> c` は async の `a --> c` ではなく sync の `"a-" -> c` を指すようになる。その edge が無ければ、この rule はどの edge にも当たらなくなり、診断も出ない
- `karasu fmt` が正規形で書き戻す。`edge#a->#abc` は `edge#a->"#abc"` に、`edge[from=#abc]` は `edge[from="#abc"]` になる。当たる edge は変わらない

## 残した制限

- **`styles.edges` のキー（#3481）。** `"a->b" -> c` と `a -> "b->c"` は別々の canonical id とセレクタを持つようになったが、解決済みのスタイルのキーがまだ共有されるので、同じビューにあると片方への rule が両方に描かれる。`.krs.style` に書く文字列ではなく identity キーの問題なので、本決定には含めない
- **app の rule 走査（#3524）。** `append-style-rule.ts` の走査は引用符を見ないので、端点に `{` / `}` を含む edge では方向を選ぶたびに rule が追記される。挙動はテストで固定した
- **`\n` の読み方（#3523）。** `.krs` は `\n` を改行として読み、`.krs.style` は `n` として読む。GUI が書く rule の往復は崩れないが、作者が `.krs` の `"a\nb"` を `.krs.style` に写すと別の値になる
- **不要な引用符付きの rule。** `isExactSelector` はテキスト比較なので、作者が書いた `edge#"a"->c` は GUI の上書き対象として検出されず、GUI は正規形の rule を別に追記する。照合結果は同じなので変えていない
- **dotted な quoted id。** `.krs` の edge 端点の `"a.b"` をパスと区別できない件（ADR-2088 slice E）は持ち込まない。base form も端点の文字列をそのまま使う

## 却下した案

- **`edgeKey` と同じ規則で囲む:** 既存のヘルパーを使えるが、空白・記号を含む端点や末尾の `-` が囲まれないので、問題 1 と 3 が残る。内部キーの injectivity と、別の文法で読み戻せることは別の条件である
- **識別子として読めない端点の edge は base form を持たない:** 文法を変えずに済むが、quoted id の edge から右クリックの方向指定が黙って消える。quoted id は受理済みの構文なので、その edge だけ GUI 操作ができない理由を作者が知る手段が弱い。問題 3 のように識別子として読めても重なる形も別に扱う必要が残る
- **警告の文言だけ直す:** GUI が壊れた rule を書く問題が残り、canonical id が外れる挙動も変わらない
- **端点を識別子の範囲に escape する（`%20` などの符号化）:** 読めない。ADR-1096 が不透明ハッシュを却下した理由（GUI が書いた rule を人が読めること）がそのまま当てはまる
