# edge の canonical id（base form）を `.krs.style` で読み戻せる形にする

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3480](https://github.com/kompiro/karasu/issues/3480)（#3111 から分離）
  - 関連 ADR: [ADR-1096](../adr/1096-edge-id-selector.md)（`edge#<id>` セレクタと base form の決定。本設計はその base form の書き方を補う）, [ADR-1142](../adr/1142-gui-style-inplace-update.md)（GUI が `.krs.style` に rule を書き戻す経路）, [ADR-2714](../adr/2714-deploy-container-id-injective.md)（曖昧にする部分だけ引用符で囲む前例）
  - 前提 Issue: [#3520](https://github.com/kompiro/karasu/issues/3520)（hex 形の selector id が色として読まれる。`face -> db` や `Feed.Items -> x` のような普通の id でも `edge#` の rule が parse できない）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-1755](../test-perspectives/TPL-1755-edge-endpoint-selector-id-form.md)。proactive TPL として TPL-3480 を本 PR で起こす
  - コード: `packages/core/src/resolver/canonical-id.ts`, `packages/core/src/renderer/facet-overview.ts`, `packages/core/src/resolver/warnings.ts`, `packages/core/src/parser/style-parser.ts`, `packages/core/src/lexer/style-lexer.ts`, `packages/app/src/lib/append-style-rule.ts`

## 背景・課題

edge の canonical id は、著者 id（`.krs` の `#<id>`）が無ければ base form `<from><arrow><to>` になる（ADR-1096）。base form は 2 か所で使われる。

- `.krs.style` の `edge#<id>` セレクタが、この文字列と一致する edge に当たる
- SVG の `data-edge-canonical-id` に載り、app の右クリックメニューが `edge#${canonicalId} { direction: ... }` をそのまま `.krs.style` に書き込む（`upsertEdgeDirectionRule`）

base form は端点の文字列を素のまま繋ぐ。端点は quoted id なら任意の文字列を取れるが、`edge#` の端点は `.krs.style` の識別子しか読めない。この食い違いで、次の 3 つが起きる（#3111 のブランチでの実測）。

### 1. 識別子でない端点の edge に rule が書けない

```krs
system S {
  service "a b" {}
  service c {}
  "a b" -> c
}
```

canonical id は `a b->c`。app が書き込む `edge#a b->c { ... }` は `.krs.style` の parse で `style-token-type-mismatch` を 3 つ出し、どの edge にも当たらない。右クリックで方向を選んでも何も起きず、壊れた rule がファイルに残る。`"a->b" -> c`（canonical id `a->b->c`）も同じく parse エラーになる。

### 2. 別々の edge が同じ base になり、誤った `ambiguous-edge-base` が出る

```krs
system S {
  service a {}
  service "b->c" {}
  service "a->b" {}
  service c {}
  "a->b" -> c
  a -> "b->c"
}
```

両方の base が `a->b->c` になり、ADR-1096 の規則どおり両方に `ambiguous-edge-base` が出て、canonical id が外れる。警告は「同じ base を共有する edge に `#<id>` を付けよ」と言うが、2 本は端点が違う。#3111 で集約 edge が 1 本に潰れなくなったので、集約 edge でも同じ警告に届く。

### 3. 末尾が `-` の端点が async の base と重なる

`"a-" -> c`（sync）の base は `a-->c` で、`a --> c`（async）の base と同じ文字列になる。`.krs.style` の lexer は `a-` を 1 つの識別子として読むので、端点を単独で読ませても検出できない。矢印の手前という位置でだけ起きる重なりである。

いずれも base form が「`.krs.style` の lexer で読み戻せる形」になっていないことが原因である。#2819 / #3111 で入れた `edgeKey` は内部キー用で、`->`・`"`・`\` を含む端点だけを囲む。空白や末尾の `-` は囲まないので、`.krs.style` に書く文字列にはそのまま使えない。

## 現状（インベントリ）

| 役割 | 場所 | 現在の形 |
| --- | --- | --- |
| base form の生成 | `resolver/canonical-id.ts` の `edgeBaseId` | `${from}${arrow}${to}` |
| 衝突判定 | 同 `assignEdgeCanonicalIds` | base が一致したら `ambiguous-edge-base`、canonical id を外す |
| セレクタの parse | `parser/style-parser.ts`（`edge#`） | 端点は `Identifier` トークンのみ。`edgeId = first + arrow + second` |
| セレクタの照合 | `resolver/style-resolver.ts` | `edge.canonicalId === selector.edgeId`（文字列一致） |
| セレクタの出力 | `style/serialize.ts` | `#${selector.edgeId}` をそのまま出す |
| style の識別子 | `lexer/style-lexer.ts` の `readIdentifier` | `.krs` の識別子文字 + `-`（`->` / `-->` の手前で止まる。末尾の `-` は含む）+ セグメントの間の `.`（直後が識別子の先頭のとき。先頭の `.` は捨てる）。`readValue` は `-1`・`3d`・`1.5` も `Identifier` にする。上記以外の ASCII 記号は黙って捨てる（`a!` は `a`） |
| `#` の後の hex | 同 `isHexColor` | `#` + hex 3/4/6/8 桁は色として 1 トークン（値が `#` で始まる `Identifier`）。続きが単語文字か `-<単語>` のときだけ id として読む。`edge#face->db`・`edge#feed`・`#face` に加え、`edge#Feed.Items->x`（`.` が捨てられる）・`edge#abc--d->c` も id として読めない（#3520） |
| GUI の書き込み | app `append-style-rule.ts` の `upsertEdgeDirectionRule` | `edge#${canonicalId}`。既存 rule の検出は selector テキストの完全一致（`isExactSelector`） |
| 端点セレクタ | `parser/style-parser.ts`（`[from=]` / `[to=]`） | 値は `Identifier` トークンのみ |
| 警告の文言 | i18n `diagnostic.ambiguousEdgeBase.message` | `fromId` / `arrow` / `toId` を素で繋いで表示 |
| base form の他の利用者 | `renderer/facet-overview.ts:111`（facet 監査行の id）、`resolver/warnings.ts:484`（`facet-not-declared` の subject） | `edgeBaseId(edge)`。どちらも「`edge#<id>` で指せる文字列」を表示する |
| 公開 API | `core/src/index.ts` | `edgeBaseId` を export している |

`.krs.style` の lexer は `"..."` を `StringLiteral` として読み、`\` の次の 1 文字をそのまま取る（`readString`）。`.krs` の `quotedIdLiteral` は `\` → `\\`、`"` → `\"` と escape するので、この 2 つは往復する。ただし `.krs` の lexer は `\n` を改行として読み、`.krs.style` の lexer は `n` として読む。`quotedIdLiteral` は改行をそのまま出すので GUI が書く rule の往復は崩れないが、作者が `.krs` の `"a\nb"` を `.krs.style` に写すと別の値になる（#3523。style の文字列値すべてに効くので本設計からは外す）。

app の `append-style-rule.ts` は既存 rule を `/([^{}]*)\{([^{}]*)\}/g` で走査する。引用符を見ないので、端点に `{` / `}` を含む rule は既存 rule として見つからない（#3524）。

## 制約・前提

- **普通のモデルでは canonical id を変えない。** 端点が `.krs.style` の識別子として読める edge（現在 `edge#` に書けている edge のすべてと、#3520 で書けるようになる hex 形の edge）は、base form・`data-edge-canonical-id`・既存の `.krs.style` が今と同じ文字列のまま動くこと
- ADR-1096 の規則は保つ。衝突したら推測で選ばず警告して canonical id を外す。tie-break ladder・index・hash は入れない（同 ADR で却下済み）
- 著者 id と base form は名前空間を共有する。著者 id は識別子なので矢印を含まず、base form は必ず矢印を含む。この区別は崩さない
- 書き込み（canonical id の生成）と読み取り（セレクタの parse）は同じヘルパーを通す（TPL-1352）
- **out of scope**:
  - `.krs` の edge 端点が dotted な quoted id（`-> "a.b"`）をパスと区別できない件（ADR-2088 slice E の quirk）。base form も端点文字列をそのまま使うので、この区別は持ち込まない
  - `styles.edges` の style キー（#3481）。identity キーの問題で、`.krs.style` に書く文字列の問題ではない

## 検討した選択肢

### 案A: `.krs.style` の識別子として読めない端点だけ文字列リテラルで囲む

base form の各端点を、`.krs.style` の識別子 1 つとして読み戻せるならそのまま、読めなければ `quotedIdLiteral` で囲む。セレクタの parser は `edge#` の端点に `StringLiteral` も受け付け、同じヘルパーで正規化してから `edgeId` を組む。

- `"a b" -> c` → `"a b"->c`（`edge#"a b"->c`）
- `a -> "b->c"` → `a->"b->c"`、`"a->b" -> c` → `"a->b"->c`（別々の id になる）
- `"a-" -> c` → `"a-"->c`（`a-->c` と重ならない）
- `PlaceOrder -> OrderDB.OrderTable` → 今と同じ

端点を囲まずに出す条件は 3 つで、1 つでも満たさなければ囲む。

1. `StyleLexer` で端点だけを tokenize して、ちょうど 1 つの `Identifier` が端点と同じ値で返る。lexer の規則（`-`・`.`・非 ASCII・数値・黙って捨てる記号）を別に書き写さないので、lexer が変わっても判定がずれない
2. 末尾が `-` でない。端点を単独で読ませると `a-` は識別子 1 つだが、矢印の手前に置くと `a-->c` になり、`-` が矢印に吸われる。from と to のどちらに置くかをヘルパーが知らなくて済むよう、to の端点にも同じ条件を当てる（`a -> "b-"` → `a->"b-"`）
3. 先頭が `#` でない。`#abc` は単独なら色トークン（値が `#abc` の `Identifier`）として条件 1 を通るが、それは色であって識別子ではない。#3520 で selector 位置の `#` + hex を id として読むようになると、`edge##abc->c` の読み方が変わる

端点を単独で読ませた判定で拾えないのはこの 2 つである。条件 2 は位置による読み方の違い（矢印の手前の `-`）、条件 3 はトークンの種類の取り違え（色トークンが `Identifier` として返る）による。`edge#` の直後の hex（`face`・`Feed.Items`）は端点の形ではなく `edge#` の読み方の問題なので、端点を囲まずに #3520 で直す。#3520 が入るまでは、作者は `edge#"face"->db` と書けば当てられる（parser が `face->db` に正規化する）。

単独での判定は位置による読み方の違いを見落としうる（実際に条件 2 と #3520 はその見落としだった）。そのため、判定の正しさは位置に埋めた往復テストで押さえる。生成した base form を `edge#<base>` に埋めて `StyleParser` で parse し、同じ `edgeId` が返ることを、生成した文字列の集合（末尾 `-`、hex 形（単独 / `.`・`-` が続く）、先頭が数字・`-` + 数字、`#` で始まる値、`"`、`\`、空白、非 ASCII、dotted）で確かめる。

injective である理由: 囲まない端点は `.krs.style` の識別子 1 つで、`#` で始まらず、`"` を含まず、`->` を含まず（`readIdentifier` は `->` / `-->` の手前で止まる）、`-` で終わらない。したがって base form の先頭が `"` なら from はリテラルの閉じ引用符で終わり、そうでなければ from は最初の `-` のうち矢印を始めるものの手前で終わる。矢印（`->` / `-->`）の種類もその位置で 1 通りに決まり、残りが to になる。

**メリット**

- 普通のモデルでは id が変わらない（識別子として読める端点は囲まれない）
- GUI が書き込む `edge#${canonicalId}` がそのまま parse でき、同じ edge に当たる。誤った警告も消える
- `.krs` の quoted id と同じ書き方で、作者が `.krs` に書いた形と見た目が揃う。ADR-2714 の「曖昧にする部分だけ囲む」と同じ考え方
- セレクタの parse を正規化に通すので、`edge#"a"->c` と書いても `edge#a->c` と同じ edge に当たる

**デメリット**

- `.krs.style` の文法に、`edge#` の端点として文字列リテラルを足す（spec の変更）
- hex 形の端点（`face -> db`、`Feed.Items -> x`）は #3520 を直すまで `edge#` の rule が parse できない。base form はそのままで正しく（`face` も `Feed.Items` も識別子として読める）、直すのは `edge#` の直後の読み方なので、#3520 を先に入れる
- `isExactSelector` はテキスト比較なので、作者が不要な引用符を付けた rule（`edge#"a"->c`）は GUI の上書き対象として検出されず、GUI は正規形の rule を別に追記する。照合結果は同じなので害は小さい

### 案B: `edgeKey` と同じ規則で囲む

`->`・`"`・`\` を含む端点だけを囲む。#2819 / #3111 の内部キーと同じヘルパーを使える。

**デメリット**

- 空白・記号を含む端点や末尾の `-` は囲まれないので、問題 1 と 3 が残る。内部キーの injectivity と、別の文法で読み戻せることは別の条件である

### 案C: 識別子として読めない端点の edge は base form を持たない

そうした edge は canonical id を `undefined` にし、`edge#` で指したいなら著者 id を付けてもらう。必要なら info を出す。

**メリット**

- 文法を変えない

**デメリット**

- quoted id の edge から右クリックの方向指定が黙って消える（interactive でなくなる）。quoted id は受理済みの構文なので、その edge だけ GUI 操作ができない理由を作者が知る手段が弱い
- 問題 2 は「両方 base を持たない」で消えるが、問題 3（`"a-"`）のように識別子として読めても重なる形を別に扱う必要が残る

### 案D: 警告の文言だけ直す

base の衝突のうち、端点が違うものは別の文言にする。

**デメリット**

- 問題 1（GUI が壊れた rule を書く）が残る。canonical id が外れる挙動も変わらない

### 案E: 端点を識別子の範囲に escape する（`%20` などの符号化）

**デメリット**

- 読めない。ADR-1096 が不透明ハッシュを却下した理由（GUI が書いた rule を人が読めること）がそのまま当てはまる

## 比較

| 観点 | 案A | 案B | 案C | 案D | 案E |
| --- | --- | --- | --- | --- | --- |
| GUI が書く rule が parse できる | はい（hex 形は #3520 の後） | 一部のみ | 書かない | いいえ | はい |
| 誤った `ambiguous-edge-base` | 消える | 一部残る | 消える | 文言だけ変わる | 消える |
| 普通のモデルの id | 変わらない | 変わらない | 変わらない | 変わらない | 変わらない |
| 文法の変更 | `edge#` 端点に文字列 | `edge#` 端点に文字列 | なし | なし | なし |
| 読みやすさ | `.krs` と同じ形 | `.krs` と同じ形 | — | — | 低い |

## 現時点の方針

**案A を採用する。** canonical id は `.krs.style` に書かれることが前提の文字列なので、「`.krs.style` の lexer で読み戻して同じ値になる」ことを base form の条件にする。判定を lexer に任せることで、書き出す側と読む側が同じ規則で動く。

端点セレクタ `edge[from=<id>]` / `edge[to=<id>]` も同じ端点の文法に揃え、値に文字列リテラルを受け付ける（`edge[from="a b"]`）。照合は端点の値そのもの（引用符を外した文字列）と比べる。base form と同じく、識別子で書ける端点は今と同じ書き方で動く。

### 実装の指針

1. **ヘルパー**: `packages/core/src/style/edge-endpoint-literal.ts`（名前は実装時に決める）に 2 つ置く
   - `styleEndpointLiteral(endpoint)`: 案A の 3 条件（`StyleLexer` で `Identifier` 1 つが同じ値で返る、末尾が `-` でない、先頭が `#` でない）を満たせばそのまま、そうでなければ `quotedIdLiteral(endpoint)` を返す。`.krs` の bare word（`isBareWord`）は 3 条件を必ず満たすので lexer を通さずに済ませてよい（ほとんどの id がこの経路）
   - `edgeBaseForm(from, arrow, to)`: `${styleEndpointLiteral(from)}${arrow}${styleEndpointLiteral(to)}`
2. **canonical id**: `canonical-id.ts` の `edgeBaseId` を `edgeBaseForm` に通す。衝突判定はそのまま（端点が違う edge はもう同じ base にならない）。`edgeBaseId` は公開 API で、`facet-overview.ts`（facet 監査行の id）と `warnings.ts`（`facet-not-declared` の subject）も同じ関数を使うので、どちらも引用符付きの形を出すようになる。表示は「`edge#<id>` で指せる文字列」なので、それで正しい
3. **セレクタの parse**: `style-parser.ts` の `edge#` で、端点に `Identifier` か `StringLiteral` を受け付ける。どちらも端点の値（`StringLiteral` は lexer が escape を外した値）を取り出し、`edgeBaseForm` で `edgeId` を組む。著者 id（矢印の無い 1 トークン）は今のまま `Identifier` だけを受け付ける
4. **端点セレクタ**: `[from=]` / `[to=]` の値に `StringLiteral` を受け付け、`edgeFrom` / `edgeTo` には引用符を外した値を入れる。`serialize.ts` は `styleEndpointLiteral` を通して出す（`karasu fmt` の往復、TPL「parse(format(x)) ≡ parse(x)」）
5. **serialize**: `edgeId` は正規形なので今のまま出せばよい。往復テストを足す
6. **警告の文言**: `ambiguous-edge-base` の params に `base`（`edgeBaseForm` の結果）を足し、i18n（en / ja）の文言はそれを表示する。作者が `.krs.style` に書く形と同じ文字列を見せる。`fromId` / `toId` / `arrow` は残す。params の型（core `types/ast.ts` の `DiagnosticParams["ambiguous-edge-base"]`、i18n `types.ts`）も足す
7. **escape**: `.krs` と `.krs.style` の `\n` の読み方の違いは #3523 で扱う。`quotedIdLiteral` は改行をそのまま出し、`.krs.style` の `readString` も改行をそのまま読むので、GUI が書く rule の往復には影響しない
8. **app**: 書き込み側は変更なし（`edge#${canonicalId}` が parse できるようになる）。`EdgeContextMenu` の `edge#<code>{canonicalId}</code>` 表示も同じ文字列なので変更なし。既存 rule の走査（`blockRe`）は引用符を見ないので、端点に `{` / `}` を含む edge では方向を選ぶたびに rule が追記される。本設計では直さず、その挙動をテストで固定する（直すのは #3524）
9. **テスト**:
   - core: 問題 1〜3 のモデルで、canonical id が別々になり、GUI と同じ形で書いた rule がその edge だけに当たる（compile 経由）。普通の id の base form が今と同じ文字列であること。`styleEndpointLiteral` の判定（空白・`->`・`"`・`\`・末尾 `-`・`#` で始まる値（`#abc`）・先頭が数字や `-` + 数字・hex 形・非 ASCII 識別子・dotted endpoint）
   - core（往復の性質テスト）: 生成した端点の組（末尾 `-`、hex 形（単独 / `.`・`-` が続く）、先頭が数字や `-` + 数字、`#` で始まる値、`"`、`\`、空白、非 ASCII、dotted）について、`StyleParser.parse("edge#" + base + " {}")` の `edgeId` が `base` と一致し、別々の組が別々の base になる
   - core: facet 監査行の id と `facet-not-declared` の subject が、引用符付きの端点で `edge#` に書ける形になる
   - style parser: `edge#"a b"->c`・`edge#a->"b->c"`・`edge#"a"->c`（正規化）・`edge[from="a b"]` と、`serialize` の往復（`karasu fmt` の parse(format(x)) ≡ parse(x)）。矢印の無い `edge#"a b"`（著者 id の位置に文字列）はエラーのまま。to 側の条件 2（`a -> "b-"` → `a->"b-"`）。`edge#a- -> c`（空白入り）は正規化で `"a-"->c` に当たることを固定する
   - app: `upsertEdgeDirectionRule` に quoted な canonical id を渡した結果の `.krs.style` を `StyleParser` で parse し、エラーが無く `edgeId` が元の canonical id と一致する。同じ id で 2 回呼ぶと rule は 1 つのまま（`{` / `}` を含む端点は上の既知の挙動として固定）
10. **spec**: `docs/spec/style.md` / `style.ja.md` の「Edge ID selector」と「edge[from] / edge[to]」に、識別子で書けない端点は `.krs` と同じ文字列リテラルで書くこと、base form ではそうした端点が囲まれることを足す。fence の例も足す
11. **TPL**: proactive TPL-3480「別の文法に書き出す id は、その文法の lexer で読み戻して同じ値になる形で出す」を起こし、spec の該当節に `> Related TPLs:` で back-ref する。TPL-1352 / TPL-1755 から related_to で繋ぐ
12. **AT**: `docs/acceptance/` に新規ファイル。人手で確かめる項目は 1 つ:
    - app で問題 1 のモデル（`"a b" -> c`）を開き、edge を右クリックして方向を選ぶと、`.krs.style` に `edge#"a b"->c { direction: ...; }` が書かれ、その edge の向きが変わる
13. **ADR 昇格**: 実装完了後、`docs/adr/3480-edge-canonical-id-quoted-endpoints.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-1096 には `related_to` で繋ぐ（決定を覆すのではなく base form の書き方を補う）

### 影響範囲・マイグレーション

- 端点がすべて識別子として読めるモデル: canonical id・`data-edge-canonical-id`・既存の `.krs.style` は変わらない
- 識別子として読めない端点を持つ edge: canonical id に引用符が付く。現在その edge を指す `edge#` rule は parse できないので、壊れる既存 rule は無い。例外は 2 つある
  - 末尾 `-` の端点: `"a-" -> c` を `edge#a-->c` で指していた rule は今後 `a --> c`（async）だけに当たる。その base は今も async の edge と重なって ambiguous になるため、実際に効いていた rule は無い。空白入りの `edge#a- -> c` は今 `a-->c` と読まれ、`"a-"` の edge が無ければ async の `a --> c` に当たっている。正規化の後は `"a-"->c` になり、sync の `"a-" -> c` に当たるか、どれにも当たらなくなる。changeset に書く
  - `#` で始まる端点: `edge##abc->c` / `edge#a->#abc` は今 parse でき（`#abc` が色トークンとして `Identifier` になる）、`"#abc" -> c` / `a -> "#abc"` に当たっている。正規化で `"#abc"->c` / `a->"#abc"` になるので当たり続ける。#3520 が selector 位置の `#` + hex から `#` を外す際、`edge#` や矢印の後で既に `#` で始まっている `Identifier` からもう一度 `#` を外すと `abc->c` に当て先が変わるので、#3520 のテストで固定する
- 誤った `ambiguous-edge-base` が消え、右クリックの方向指定がそれらの edge で使えるようになる
- ドキュメント: `docs/spec/style.md` / `style.ja.md`、`docs/spec/diagnostics.md`（`ambiguous-edge-base` の説明に base の表示形を足すなら）
- changeset: core / karasu の patch（バグ修正。`.krs.style` の受理形は広がるが、既存の書き方は変わらない）。`edgeBaseId` の出力、facet 監査行の id、`facet-not-declared` の subject が、識別子でない端点で引用符付きになることと、空白入りの `edge#a- -> c` の当て先が変わることを書く
- examples: 識別子でない端点の edge は無い想定（実装時に `pnpm pr:shots` で確かめる）

## 未解決の問い / 決めないこと

- hex 形の selector id（#3520）は本設計の前提として別 Issue で直す。node の `#face`・`#Feed.Items` も同じ原因で外れているため、edge だけの話ではない
- app の rule 走査が引用符を見ない件（端点に `{` / `}`）は、挙動をテストで固定したうえで #3524 で直す
- `.krs` と `.krs.style` の文字列 escape の違い（`\n`）は #3523 で扱う
- `isExactSelector` を構造比較（parse して `edgeId` で比べる）にして、不要な引用符付きの rule も GUI の上書き対象にするか。照合結果は同じなので本設計では変えず、必要になったら別 Issue にする
- `.krs` 側の edge 端点で dotted な quoted id を区別すること（ADR-2088 slice E の quirk）は扱わない
