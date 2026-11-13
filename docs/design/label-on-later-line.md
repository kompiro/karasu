# target の次の行に書いた edge と link の label の扱い

- **日付**: 2026-11-13
- **ステータス**: 検討中
- **PR**: #TBD
- **関連**:
  - 引き金 Issue: [#3766](https://github.com/kompiro/karasu/issues/3766)（#3752 の Design Doc で切り出した判断）
  - 関連 ADR: [ADR-3752](../adr/3752-optional-string-stops-at-next-edge.md)（任意で続く要素は後の行で始まる次の edge を読まない）, [ADR-2208](../adr/2208-positional-label-error-promotion.md)（spec に無い受理形を error にした前例）, [ADR-2167](../adr/2167-realizes-comma-list.md)（カンマ列挙の受理形）, [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（`.krs` の凍結）, [ADR-2677](../adr/2677-language-v2-act.md)（language v2.0。error の定義）, [ADR-2209](../adr/2209-edge-property-block.md)（edge の property block）
  - 関連 TPL: [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md), [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md), [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
  - コード: `packages/core/src/parser/edge-parser.ts`, `packages/core/src/parser/property-readers.ts`, `packages/core/src/parser/node-path.ts`

## 背景・課題

edge の positional label と link の label は、target（link では URL）の次の行に書いても受理される。

```krs
system S {
  service a {}
  service b {}
  a -> b
    "calls"
}
```

これは `a -> b "calls"` と同じモデルになり、診断は出ない。ADR-3752 で、任意で続く文字列は「後の行で、その行に矢印が続くなら次の edge の source」として読まないようにした。その結果、次の行の文字列の読み方は「その行で矢印が続かなければ label」という規則になった。正しいが説明しにくく、spec のどこにも書かれていない（TPL-2133）。

この形を spec に書いて受理し続けるか、warning で知らせるか、error にするかを決める。

## 現状（インベントリ）

main（ddad0e69）で、edge を行で分けて書いた形を `Parser.parse` と `format` に通した結果:

| 書き方 | 診断 | `karasu fmt` の出力 |
| --- | --- | --- |
| `a` / `-> b` | なし | `a -> b` |
| `a ->` / `b` | なし | `a -> b` |
| `a -> b` / `"calls"` | なし | `a -> b "calls"` |
| `a -> b "calls"` / `[async]` | なし | `a -> b "calls" [async]` |
| `a -> b "calls"` / `#e1` | なし | `a -> b "calls" #e1` |
| `a -> b` / `{ label "calls" }` | なし | `a -> b "calls"` |
| service の中の `-> b` / `"calls"` | なし | `-> b "calls"` |
| service の中の `link "https://e.com"` / `"Docs"` | なし | `link "https://e.com" "Docs"` |
| service の中の `label` / `"A"`（必須の値） | なし | `label "A"` |
| `service` / `a {}`（宣言の id） | なし | `service a {}` |

| 観点 | 現状 |
| --- | --- |
| lexer | 改行を token にしない。spec の「Lexical structure」は LF を「token を区切る空白」と書く（2026-10-09、#3093 で追加）。行の扱いを書いた節は、ほかに無い |
| 行が意味を持つ規則 | 2 つある。カンマ列挙は「区切りとその後の要素は、前の要素が終わった行に書く」（spec「Comma-separated value lists」、#2551）。任意で続く要素は「後の行で始まり、その行に矢印が続く id・文字列を読まない」（ADR-3752、spec には無い） |
| spec の「Edge declaration」 | `<from_id> -> <to_id> "<label>"` の 1 行の形だけを示す。link は `link "<URL>" "<label>"` |
| formatter | label を target と同じ行に書く。上の表のどの形も 1 行に戻す |
| repo の使用例 | 次の行の label は 0 件（#3752 の測定。テスト 6,544 件・`examples/**/*.krs` 97 件・docs と skill の全 fence）。#3768 が「今の挙動」として固定したテスト 3 件だけが使う |
| 文の先頭になれる token | id と文字列リテラル（edge の source、宣言のキーワード）、node の block の中の `->` / `-->`（暗黙の source の edge）。`#e1` も lexer では id なので edge の source として読めるが、node の id にはならない。`[`・`{` は文の先頭にならない |
| 単独の文字列の文 | system でも node の block でも `unexpected-token-in-block`（error）。label は失われる |

## 制約・前提

- 言語の約束（ADR-1314、ADR-2677 が初めて行使した言語版のセマンティクス）: 既存の妥当な `.krs` は、言語版の major が変わるまで parse し続ける。受理していた形を error にするなら、それが「妥当な `.krs`」の範囲かを決める必要がある。前例は両方向にある
  - ADR-2208: ADR-19 で撤去した位置引数の label を error にした。「spec に無い形の撤去は凍結 spec への準拠である」と判断した。spec のどこからも導けない形だった
  - #2551（PR #2686、言語版 1.0 の期間）: カンマ列挙が行をまたいで続く形を、受理から error に変えた。言語版は変えていない。ただし凍結との関係を論じた記録は無く、当時の spec には「Lexical structure」の節がまだ無かった
  - ADR-2677: 受理していた 2 つの形（`node-not-in-context`、`annotation-possible-typo`）を error にするために、言語版を 2.0 に上げた
  - 本件の形は、spec の「Edge declaration」の 1 行の形には無いが、2026-10-09 に加わった「Lexical structure」の「LF は token を区切る空白」から導ける。ADR-2208 の形よりも「妥当な `.krs`」に近い
- error のある間、どの surface も新しい図を出さない（ADR-2677 決定 9）。`karasu fmt` は error のある source を整形しないので、error にした後は手で直す（ADR-2208）
- 対象は edge の positional label と link の label の 2 つ（任意で続く文字列）に限る。次の行の `[tags]`・`{`・path の続き（`a -> b` / `.c "calls"`）は変えない。次の行の `#<id>` は `a -> b` / `#e1 -> c` で edge の id として読まれ error 2 件になるが、`#e1` は node の id になれないので黙って違うモデルにはならず、本件では扱わない
- 必須の値が無いとき（`label` プロパティの値、末尾のドットの後の段: `a -> b.` / `"calls"` は `b.calls` と読まれ診断が出ない）の扱いは #3767 で決める

## 検討した選択肢

### 案1: spec に書いて受理を続ける

spec の「Edge declaration」と link の節に、label は target の次の行に書いてもよいこと、ただしその行に矢印が続く文字列は次の edge の source であること（ADR-3752 の規則）を書く。

**メリット**

- 受理する言語は変わらない。利用者の `.krs` が error にならない
- 実装は spec と、`karasu fmt` が 1 行に戻すことの記述だけ

**デメリット**

- 「後の行の文字列は、その行に矢印が続かなければ label」という規則を利用者が覚えることになる。カンマ列挙の「行をまたがない」と逆の規則が並ぶ
- `-> b` / `"calls"` / `-> c` のように、label と次の edge の見分けを行の中の矢印に頼る形が残る

### 案2: warning で知らせ、受理は続ける

次の行の label を今と同じ AST で受理し、新しい warning（例: `label-on-later-line`）を出す。メッセージは「label を target の行に移す。`karasu fmt` で直る」と伝える。将来の言語版の major で error にするかは、そのときに決める。

**メリット**

- 既存の `.krs` は図が描かれ続け、`karasu fmt` で機械的に直せる
- 新しい診断コードの追加は、凍結の下でも許される追加的な変更（ADR-1314）

**デメリット**

- 「矢印が続かなければ label」という規則は、warning で非推奨と知らせても、受理される規則として spec に残る（案3 も回復のために値を label として読むが、受理はしない）
- warning を経て error にする 2 段階になる。repo に使用例は無く、第三者の `.krs` は公開コードに見つからない（ADR-2677 の背景）ので、猶予を置いても移行する対象が見えない

### 案3: label は直前の token と同じ行に限り、次の行の label を error にする

edge の positional label は target（`#<id>` や tags の前、target の path の最後の段）が終わる行、link の label は URL が終わる行にだけ書ける。後の行の文字列は label として読まない。その行に矢印が続けば次の edge の source（ADR-3752 のまま）。続かなければ専用の error（例: `label-on-later-line`）を出す。読んだ文字列は AST の label として残す（ADR-2208 と同じく、著者が書いた値を回復で捨てない）。

試しに label の reader を「同じ行」に限って測ると、core・lsp・cli のテストは、#3768 が今の挙動として固定した 3 件（次の行の edge の label、次の行の link の label、`-> b` / `"calls"` / `-> c`）だけが落ちた。docs と skill の全 fence は通った。

**メリット**

- label の規則が「target（link では URL）と同じ行に書く」の 1 文になり、行の中の矢印を見る例外が要らなくなる。カンマ列挙の「区切りとその後の要素は、前の要素が終わった行に書く」と同じ向き（任意の続きを前の行に留める）になる。ただし 1 つの規則にまとまるわけではない。カンマ列挙は文の先頭にならない `,` も行に留め、label の規則は文の先頭にならない `[tags]`・`{`・path の続きを次の行に許したままにする。spec には 2 つの規則として書く
- `-> b` / `"calls"` / `-> c` のように、行の中の矢印で label と edge を見分ける形が無くなる
- 専用の error が、何をどこへ移せばよいかを伝える。今の単独の文字列の文（`unexpected-token-in-block`）より直しやすい

**デメリット**

- 受理していた形を error にする。repo に使用例は無いが、利用者の `.krs` に無いことは確かめられない。error になった後は `karasu fmt` で直せない
- 言語版を上げるかの判断が要る。上げるなら、言語版 3.0 をこの 1 件のために切ることになる（下の方針で、上げないと決めた）

### 案4: 改行を文の区切りにする

すべての文を 1 行に限り、改行を区切りとして token にする。

**デメリット**

- 上の表の 10 の書き方をすべて error にする。property block や複数行の文字列の扱いも決め直す必要があり、本件の範囲を大きく超える

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 次の行の label | 受理 | 受理 + warning | error（値は残す） | error |
| 利用者が覚える規則 | 矢印が続かなければ label | 同左 | label は target の行 | 文は 1 行 |
| カンマ列挙の行の規則との向き | 逆 | 逆（warning で寄せる） | 同じ向き（規則は別） | より強い |
| 既存の `.krs` | 変わらない | 図は出る、`fmt` で直る | 図が出ない、手で直す | 多くが error |
| 言語版の判断 | 不要 | 不要 | 上げない（下の方針） | 要る |
| 実装 | spec のみ | 診断 1 つ + spec | 診断 1 つ + reader 2 つ + spec | 大きい |

## Related TPLs

- [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md): parser が受理する形は spec に書く。どの案でも、spec に行の規則を書く
- [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md): カンマ列挙の「区切りの後で次の行を消費しない」。案3 はこの規則を任意の label に広げる
- [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md): 任意で続く要素は後の行の次の文を読まない。案3 では判定の使い方が「edge の source か、置き場所を誤った label か」の見分けに変わる
- [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md): `karasu fmt` の往復。案3 の error は fmt の入力にならないので、往復の対象は同じ行の label だけになる

## 現時点の方針

**案3 を採る（kompiro が 2026-11-13 に決定）。** 決め手は規則の説明しやすさである。案1・案2 は「後の行の文字列は、その行に矢印が続かなければ label」という、カンマ列挙と逆向きの規則を受理される規則として残す。案3 では label の規則が「target と同じ行に書く」の 1 文になり、行の中の矢印で label と edge を見分ける形が無くなる。受理していた形を error にするが、repo に使用例は無い。

言語版（`KRS_LANGUAGE_VERSION`、今は `2.0`）は上げない（kompiro が 2026-11-13 に決定。前例が両方向にあることを示したうえでの判断）。「Lexical structure」の空白の説明は文字の分類を定めたもので、文をどう書けるかを定めたものではない、と読む。文の形は「Edge declaration」などの文法の節が定め、そこに次の行の label は無い。#2551 も行の規則の変更を言語版を変えずに入れた。

この読み方では、上の表のほかの行の分け方（`a` / `-> b` など）も spec に書かれていない受理形になる（TPL-2133）。そこで spec に、1 つの文を複数の行に分けて書いてよいことと、その例外（カンマ列挙と label）をまとめて書く（実装の指針 4）。

検討した残りの 2 つ:

- **言語版を 3.0 に上げる**（ADR-2677 と同じ扱い）: 使用例の無い 1 つの形のために言語版の major を切ることになり、釣り合わない
- **今は warning にし、次の major で error にする**（案2 の経路）: 凍結の約束にもっとも忠実だが、次の major まで「矢印が続かなければ label」が受理される規則として残る

### 実装の指針

1. `edge-parser.ts` の `parseEdge`: positional label は、直前に読んだ token が終わる行で始まる文字列だけを読む。後の行の文字列は、`opensEdgeOnLaterLine` が真なら読まずに残し（次の edge の source）、偽なら `label-on-later-line` を報告して label として読む
2. `property-readers.ts` の `parseLink`: URL が終わる行で同じ扱いにする
3. 診断: `label-on-later-line`（error）を追加する。`diagnostic-ids.ts` に次の `KRSnnn` を振り（再利用しない）、`ast.ts` の `DiagnosticParamsByCode`、診断カタログ、i18n（en / ja）、`docs/spec/diagnostics.md` と `diagnostics.ja.md` の「Syntactic & parse-level errors」の族に載せる。範囲は文字列そのもの。メッセージは「label を target（link では URL）と同じ行に書く」と伝える
4. spec: 「Lexical structure」の後に、1 つの文は複数の行に分けて書いてよいこと（上の表の分け方）と、その例外として行を越えないもの（カンマ列挙の区切りと要素、edge と link の label）を書く。「Edge declaration」と link の行（`syntax.md` と `syntax.ja.md`）に、label は target（URL）と同じ行に書くこと、後の行の文字列は、その行に矢印が続けば次の edge の source、続かなければ `label-on-later-line` であることを書く。`krs invalid` の fence で次の行の label を示す。`> Related TPLs:` に TPL-3752 を置き、TPL-3752 に「派生元 spec」節を新しく作って back-ref を書く（spec-audit の規則）。同じコミットで `pnpm run lint:skill-reference-bundle-sync --write` を実行し、`packages/skills/skills/{karasu-author,reverse-architecture}/reference/` のコピーを更新する
5. テスト: #3768 の 3 件を新しい期待値に替える。error 1 件と label の値が残ることを、次の入力で固定する
   - edge: system と node の block、`->` と `-->`、path の target（`a -> S.b` / `"calls"`）、複数行の target（`a -> "b⏎c"` / `"x"`）、次の行で始まる複数行の label、`-> b` / `"calls"` / `-> c`、infra block の中の edge
   - link: node の block、edge の property block の中（`a -> b { link "u"` / `"Docs" }`）、infra block、org の block
   - 変わらないもの: 同じ行の label、`a -> "b⏎c" "calls"`、次の行の `[tags]`・`{`・path の続き、次の行で始まる edge（ADR-3752）
6. TPL-3752 のチェックリストと既知の対処パターンを、案3 の読み方に合わせて直す
7. AT: `docs/acceptance/3766-label-on-later-line.md`。手動項目は無い
8. changeset: `@karasu-tools/core`・`karasu`・`karasu-skills` の minor（新しい診断と、skill が同梱する spec の変更）。受理していた形が error になることと、直し方（label を target の行に移す。`karasu fmt` を使うなら上げる前に実行する）を書く。言語版を上げるなら、それも書く（ADR-2677 決定 1）
9. ADR 昇格: 実装 PR のマージ後、`docs/adr/3766-label-on-later-line.md` として昇格し、本 Design Doc を同じ PR で削除する。ADR-3752 は「変わらないもの」に次の行の label を挙げているので、`related_to: [ADR-3752]` を置き、その扱いを本件で決めたことを書く（ADR-3752 は扱いを #3766 に送っているので supersede はしない）

### 影響範囲・マイグレーション

- target や URL の次の行に label を書いた `.krs` は error になり、図が出なくなる。karasu-nest に預けた `.krs` も描画のエンドポイントが 422 を返すようになる（ADR-2677 決定 9）。直し方は label を同じ行に移すことで、`karasu fmt` を使うなら error にする版へ上げる前に実行する（ADR-2208 と同じ順序）
- `-> b` / `"calls"` / `-> c` も同じ error になる。`-> c` は今どおり別の edge として読む
- それ以外の行の分け方（上の表の source・矢印・target・tags・`#<id>`・`{`・宣言の id・必須の値）は変わらない
