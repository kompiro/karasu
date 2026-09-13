# 引用符なしのアノテーションパラメータ値を壊さずに拒否する

- **日付**: 2026-09-11
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2707](https://github.com/kompiro/karasu/issues/2707)（lexer が引用符なしの hyphen 値から数字を捨て、`until: 2026-12-31` が `-` になる）
  - 先行 ADR: [ADR-2571](../adr/2571-fmt-annotation-parameters.md)（本件を 3 つの「却下（範囲外）」として分離した張本人）、[ADR-1568](../adr/1568-migration-intent-fields.md)（パラメータ構文）、[ADR-1995](../adr/1995-draft-confidence-annotation.md)（`confidence` の verbatim 保持）、[ADR-2087](../adr/2087-escape-emitted-string-values.md) / [ADR-2076](../adr/2076-formatter-top-level-exhaustiveness.md)（同じ round-trip 系列）
  - 関連 TPL: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（lexer が受理する形と formatter が裸で出す形の一致／AST が境界を捨てたら対処は AST 側）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理する語彙は効果を持つか警告される）、[TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)（kebab 名ポジションは縫合を共有する）、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)（register の選択）、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)（カタログ網羅）
  - コード: `packages/core/src/lexer/lexer.ts`、`packages/core/src/parser/parser.ts` の `parseAnnotations`、`packages/core/src/formatter/quote-id.ts`、`packages/core/src/formatter/formatter.ts` の `renderAnnotations`

## 背景・課題

`.krs` の lexer は識別子の開始文字を `[\p{L}_]` と定義しており（`lexer.ts` の `isIdentStart`）、
そこから外れた文字は `readToken` の `default` 節で **1 文字進めて捨てる**（`// Skip unknown character`）。
数字はこの節に落ちるため、`@deprecated(until: 2026-12-31)` の `2026` `12` `31` はトークンにならずに消え、
`-` だけが `Identifier("-")` として 2 つ残る。parser にはそれが「日付だったもの」だと知る手がかりがない。

Issue が挙げた 3 点はいずれも同じ根に繋がっている。

1. **値が壊れる**: 引用符なしの hyphen 付き値が `-` として記録され、`karasu fmt` が `until: "-"` として著者のファイルに焼き込む。
2. **読めない値に診断が出ない**: ADR-2571 が `""` の捏造をやめた結果、読めない値は「記録しないが何も言わない」状態になった。TPL-1503 が禁じる「受理するが効果も警告もない」に該当する。
3. **`annotationParams` が occurrence を表現できない**: 同名アノテーションを 2 回書くと後勝ちで上書きされ、`fmt` が著者の 1 つ目の値を 2 つ目で書き潰す。

なお Issue 本文は `2026-12-31` について「Nothing reports either」と書いているが、実測では
**誤った警告が 1 件出ている**（`annotation-param-unsupported` が `-` を「未対応のキー」として名指しする）。
著者がキーとして書いていないものを名指しする診断は、ADR-2571 が `from: system` について直したものと同じ誤りであり、
hyphen 付きの値では残っている。

本設計の背骨は 1 つ。**lexer が「裸で書ける語」と判定する集合と、`quote-id.ts` の `needsQuotes()` が
「裸で出してよい」と判定する集合が食い違っている**。`needsQuotes("2026")` は「引用符が要る」と答えるのに、
lexer はその文字列を黙って削除する。TPL-1101 が root cause として記録している食い違いそのものである。

## 現状（インベントリ）

### 実測: 今日の挙動（main @ 99de3440）

| 入力 | AST | 診断 | `karasu fmt` の出力 |
| --- | --- | --- | --- |
| `@deprecated(until: 2026-12-31)` | `{deprecated:{until:"-"}}` | warning `annotation-param-unsupported`（key `-`、**誤り**） | `@deprecated(until: "-")` |
| `@deprecated(until: 2026-Q3)` | `{deprecated:{until:"-"}}` | warning（key `Q3`、**誤り**） | `@deprecated(until: "-")` |
| `@deprecated(until: 2026)` | パラメータなし | **なし** | `@deprecated` |
| `@deprecated(until: 2026abc)` | `{deprecated:{until:"abc"}}` | **なし** | `@deprecated(until: "abc")` |
| `@migration_target(from: Legacy-Monolith)` | `{migration_target:{from:"Legacy"}}` | warning（key `-`、**誤り**） | `@migration_target(from: Legacy)` |
| `@migration_target(from: Shop.Legacy)` | `{migration_target:{from:"Shop"}}` | warning（key `.`、**誤り**） | `@migration_target(from: Shop)` |
| `@migration_target(from: system)` | パラメータなし | **なし** | `@migration_target` |
| `service A [2026]` | `tags: []`（タグ消滅） | **なし** | タグごと消える |
| `service A [team-1]` | `tags: ["team", "-"]` | `tag-not-builtin` × 2（断片名について） | 断片 2 つに割れる |
| `service 2Foo` | `id: "Foo"` | **なし** | `service Foo` |
| `A -> 2B`（`service B` が存在する） | edge `A -> B` | **なし** | `A -> B` |
| `@deprecated(until: "2026-Q3") @deprecated(until: "2027-Q3")` | `{deprecated:{until:"2027-Q3"}}` | **なし** | 両方が `"2027-Q3"` |

Issue が挙げた 2 例より被害は広い。とくに `until: 2026abc` は**数字だけが消えて `"abc"` という
もっともらしい値が記録される**（診断ゼロ）。最も重いのは `A -> 2B` で、存在しないはずの終端が
**別の既存ノード `B` に黙って付け替わる**。図は正しく描かれているように見える。
`from: Legacy-Monolith` / `from: Shop.Legacy` は数字を含まないので lexer の数字破棄とは別経路だが、
症状は同じ「値の切り詰め + 誤ったキー名の警告」である。

`[team-1]` は TPL-2509 の違反でもある。`.krs.style` の lexer は `[a-zA-Z0-9_-]` を識別子に含めるので
セレクタ側では `team-1` が 1 つの名前になるが、`.krs` 側は数字が消えて `team` と `-` に割れ、
同じ綴りのタグとセレクタが一致しない。

### 実測: lexer が実際に捨てている文字

examples 85 本 + `docs/**` の ` ```krs ` fence 361 本、計 446 ソースをトークン化し、
どのトークンにも覆われない非空白文字を数えた結果:

| 文字 | 件数 | 出現箇所 |
| --- | --- | --- |
| `=` | 16 | `docs/acceptance/0049-*.md` の `service S1 { label = "Service 1" }` 等 |
| `;` | 16 | `docs/acceptance/2172-*.md` の `function "ledger" { runtime "nodejs"; realizes Ledger }` 等 |
| `<` `>` | 各 5 | `docs/adr/1104-*.md` のテンプレート表記 `resource <Resource>Resource` |
| **数字** | **0** | なし |

つまり `=` と `;` は「捨てられることで通っている」黙認構文であり（`docs/spec/syntax.md:131` の
`store { type "ElasticSearch 8"; realizes SearchIndex }` も同じ）、**数字はコーパスのどこでも捨てられていない**。
数字の破棄を止めても、committed な `.krs` とドキュメントの挙動は 1 つも変わらない。

### 実測: 破棄をやめたときの影響

- **数字だけトークン化する**（digit 始まりの run を 1 トークンにする）: `packages/core` の全 154 ファイル / 4409 テストが無改変で pass。
- **全ての未分類文字をトークン化する**: 5 テストが fail。いずれも `realizes = "X"; runtime = "node:20";` を使う古い fixture で、`=` と `;` の黙認に依存していた。
- **数字のトークン化 + kebab 断片として `Number` を受ける**（`kebab-name.ts` の `isWordToken` に 1 行）: 同じく 4409 テストが無改変で pass。

### 実測: `Number` トークンが各ポジションでどう着地するか

「数字のトークン化 + kebab 断片の縫合」を当てた状態で、各ポジションに数字始まりの語を置いた結果:

| ポジション | 入力 | AST | 診断 |
| --- | --- | --- | --- |
| タグ | `[2026]` | `tags: ["2026"]`（**記録される**） | `tag-not-builtin` |
| タグ（kebab 断片） | `[team-1]` | `tags: ["team-1"]` | `tag-not-builtin`（1 件、書いた名前について） |
| アノテーション名（kebab 断片） | `@phase-2` | `annotations: ["phase-2"]` | `annotation-not-builtin` |
| capability 名（kebab 断片） | `capability p2p-2` | （未確認） | なし（縫合しない場合は error `unexpected-token-in-block`） |
| エッジ終端 | `A -> 2B` | edge `A -> 2B`（**記録される**） | error `expected-id-or-string` + `unresolved-edge-endpoint` |
| アノテーション名（先頭） | `@2026` | 記録されない | error `unexpected-token-in-block` ほか |
| ノード id | `service 2Foo` | 記録されない | error `expected-node-id` + recovery cascade 3 件 |
| エッジ始端 | `2A -> B` | 記録されない | error `unexpected-token-in-block` × 3 |
| `label` / `description` の値 | `label 2026` | 記録されない | error `expected-string-after` |
| `realizes` / `runtime` の値 | `realizes 2A` / `runtime 20` | 記録されない | error `expected-id-after` / `expected-property-value` |

**黙って受理されるポジションは 1 つも無い**が、「どこにも受理されない」わけでもない。AST に値が残るのは
タグ（`parseTags` が区切り以外の任意のトークンを値として取るため）とエッジ終端（エラーを出したうえで値を保持する
既存の recovery）の 2 箇所で、どちらも診断が付く。

parse エラーがあっても図は描かれる（上の全ケースで SVG が生成された）。error が止めるのは `karasu fmt` の
書き込みだけである（`format()` は `severity === "error"` の診断があると `FormatError` を投げる）。

### `annotationParams` の読み手

| 読み手 | 何をするか |
| --- | --- |
| `formatter.ts` の `renderAnnotations`（254 行 / 545 行から呼ばれる） | 名前ごとに 1 スロットなので、同名 2 回のとき両方に同じパラメータを出す（ADR-2571 決定 6） |
| `annotations/migration-intent.ts` の `getMigrationIntent` | `deprecated.until` / `experimental.until` / `migration_target.from` を読む。`from` は resolve せず verbatim |
| `annotations/draft-confidence.ts` の `getDraftState` | `draft.confidence` を読む |
| `compile/compile.ts:814-815` | 上記 2 つを nodeMetadata に載せる |
| `types/ast.ts:167` / `:536` | 型宣言 2 箇所（node 系と team 系） |

## 制約・前提

- **ADR-2571 決定 4 を維持する**: 読めない値は記録しない。`""` を記録すると `fmt` が著者のファイルに書き戻す。
- **ADR-2571 決定 3 を維持する**: 値種ごとに正準形は 1 つ（`until` / `confidence` は常に引用符つき、`from` は `quoteId`）。引用符の有無は AST に残らない。
- **診断の register は `docs/spec/diagnostics.md` の定義に従う**: error は「モデルが malformed で、その構文は拒否される」、warning は「著者が直すべき実在の欠陥」。spec の warn-don't-error は未解決参照（§S6）についての規定であり、パラメータ値には及ばない。
- **`=` と `;` の黙認は本設計の範囲外**。ドキュメント（acceptance 記録を含む）が使っており、トークン化すると既存の doc fence と fixture が壊れる。数字だけを扱う。
- **新しい診断コードはカタログ 4 箇所に触る**: `types/ast.ts` の code union、`packages/i18n` の en/ja、`docs/spec/diagnostics.md` の en/ja。TPL-1623 のカタログ網羅テストが drift を落とす。
- **spec を触ると skill バンドルの同期が要る**: `docs/spec/{syntax,tags-annotations,diagnostics}.md` は reverse-architecture skill が同梱しており、`pnpm run lint:skill-reference-bundle-sync --write` を同じコミットで走らせる（`.claude/rules/spec-audit.md`）。
- **ドキュメントの `.krs` fence は実際に parse される**。`krs invalid` fence は「今も parse **エラー**が出ること」を検証する。拒否形を `krs invalid` で示せるのは、その診断が error のときだけで、warning なら `krs fragment` か表で書く（Part 2 の register 次第）。

## 検討した選択肢

### Part 1: 引用符なしの値が壊れる問題

#### 案1-A: lexer が数字を捨てるのをやめ、parser は「完全な 1 トークン」だけを値として受ける（推奨）

lexer の `default` 節に digit 始まりの分岐を足し、`[0-9][\p{L}\p{N}_]*` の run を 1 つの
`TokenType.Number` として emit する。

`Number` の契約は「**どのポジションでも黙って受理されない**」であり、「どこにも受理されない」ではない
（上の実測表）。ほとんどのポジションでは parse エラーになって記録されない。値が AST に残るのは次の 2 箇所で、
どちらも診断が付く:

- **タグ**: `[2026]` はタグ値 `"2026"` として保持され、resolver が `tag-not-builtin` を出す。
  v1.x で他の非組み込みタグ名が受ける扱いと同じであり、タグの受理集合はこの形で広がる。
- **エッジ終端**: `A -> 2B` は `expected-id-or-string`（error）を出したうえで `2B` を保持する既存の recovery に乗る。

あわせて `kebab-name.ts` の `isWordToken` が `Number` を**先頭以外の断片**として受ける。
`[team-1]` / `@phase-2` / `capability p2p-2` が 1 つの名前になり、`.krs.style` 側の綴りと一致する（TPL-2509 の検証項目 2）。
先頭の断片は `Identifier` か keyword のままなので、`[2026]` のような数字始まりの名前の扱いは変わらない。
**この 1 行は lexer の変更と対で入れる**。lexer だけを変えると、`[team-1]` は今日の 2 断片（`team`, `-`）から
3 断片（`team`, `-`, `1`）に悪化する。

さらに `parseAnnotations` の値読みを変える。値は **1 トークンで読み切れ、かつ次が `,` / `)` / EOF** で
なければならない。この規則は既存の `needsQuotes()` と一致する。

> 裸で書ける値とは、`needsQuotes()` が「引用符不要」と答える形のことである。
> それ以外（数字始まり、hyphen、ドット、予約語、空白）は引用符で書く。

**メリット**

- 根本原因（lexer の黙殺）を直す。`until: 2026abc` が `"abc"` を捏造する経路と、`A -> 2B` が既存の `B` に付け替わる経路を同時に閉じる
- 縫合と対にすることで、`[team-1]` のタグとセレクタの不一致（TPL-2509 違反）も閉じる
- 判定規則を `needsQuotes()` 1 つに畳めるので、parser と formatter の食い違い（TPL-1101 の root cause）が構造的に起きない
- hyphen / ドットを含む値（`Legacy-Monolith` / `Shop.Legacy`）も同じ規則で拒否でき、誤ったキー名の警告 3 種が消える
- 実測でコーパス影響ゼロ、core 4409 テストが無改変で pass（縫合の 1 行を含めても同じ）

**デメリット**

- `service 2Foo` が黙って `service Foo` になっていたのが 4 件のエラー（うち 3 件は既存の recovery cascade）になる。壊れた入力に対する挙動の変化であり、正しい方向ではあるが diff は出る
- `[2026]` が「消えるタグ」から「記録されるタグ」に変わり、タグの受理集合が広がる。resolver が `tag-not-builtin` 警告を出す（実測確認済み）ので、TPL-1503 の禁じる沈黙にはならない
- 新しい TokenType が 1 つ増える。`unexpected-token-*` の診断文に `Number` が出るようになる

#### 案1-B: lexer は触らず、parser 側だけで「完全な 1 トークン」を要求する

`until: 2026-12-31` は「値トークンの次が `)` でない」ので拒否でき、headline の症状は消える。

**メリット**

- lexer を触らないので影響範囲が `parseAnnotations` に閉じる

**デメリット**

- `until: 2026abc` は 1 トークン `Identifier("abc")` として通るので、**数字が消えて `"abc"` が記録される経路が残る**
- `[2026]` / `service 2Foo` の黙殺と、`A -> 2B` の付け替えも残る。根本原因を残したまま 1 ポジションだけ塞ぐ形になり、次に値を読むポジションが増えたときに同じバグが再演する

#### 案1-C: hyphen 付きの裸の値を縫合して受理する（`until: 2026-12-31` を正式な綴りにする）

tag / annotation 名と同じく `stitchKebabTail` を値ポジションにも適用する。

**メリット**

- 著者が書いた日付が失われない。素直に「読める」

**デメリット**

- TPL-2509 が縫合を要求しているのは **open vocabulary の名前ポジション**であって、値ポジションではない。`from` はノード参照であり、`Legacy-Monolith` は `needsQuotes()` が引用符を要求する形なので、裸で受けるとノード id の綴り規則と食い違う
- ADR-2571 決定 3 により、受理しても `fmt` が即座に `until: "2026-12-31"` と引用符つきに書き換える。著者のファイルに差分だけが出て、表現力は増えない
- 同じ値に 2 つの綴りができ、「値種ごとに正準形 1 つ」の決定と衝突する

### Part 2: 読めない値に診断が無い

新規コード **`annotation-param-value-unreadable`** を 1 つ足す。これ 1 コードで、今日の 3 つの症状
（誤った key 名の警告 / 沈黙 / 値の捏造）がすべて同じ 1 つの診断に収束する。

メッセージは**アノテーション名とキー**を名指しし、引用符で書けと示す
（例: `"@deprecated" parameter "until" has a value that cannot be read; quote it (until: "…")`）。
キー自体は著者が書いたものなので名指ししてよい。名指ししてはいけないのは、ADR-2571 が直した
「値をキーとして報告する」形である。

#### register: 要判断

どちらの register でも、読めない値は記録しない（ADR-2571 決定 4）。違いは `karasu fmt --write` の挙動に出る。
parse エラーがあっても図は描かれる（実測）ので、register が変えるのは実質 `fmt` だけである。

| | 案2-A: warning | 案2-B: error（推奨） |
| --- | --- | --- |
| `fmt --write` | **著者の値を消して** `@deprecated` と書き込む | 書き込みを拒否し、ファイルはそのまま残る |
| 図の描画 | 描かれる | 描かれる |
| `annotation-param-unsupported` との関係 | 同じ register に揃う | register が分かれる |
| 記録済みの前提との関係 | Issue 本文の「warning, most likely」と一致。ADR-2571 決定 4 の「`fmt` は裸の `@deprecated` に戻す」とも一致 | 上の 2 つから外れる |
| 拒否形を spec に示す fence | `krs fragment` か表 | `krs invalid`（lint が error のまま保たれることを検証する） |

**案2-B を推奨する**。根拠は 2 つある。

1. **Part 3 と同じ論理が当てはまる**。案3-A を「警告は `fmt` を止めない。データ損失を告知するだけ」として却下するなら、
   案2-A はまさにその形である。`@deprecated(until: 2026-12-31)` に `fmt --write` をかけると、著者が書いた日付が消える。
   ADR-2571 自身が「パラメータを落とすのがバグ」と書いている。
2. **register を spec の定義で分けると整合する**。読めない値は parser が読めなかった構文であり、
   error の定義「モデルが malformed で、その構文は拒否される」に当たる。一方、未対応キー
   （`annotation-param-unsupported`）は読める構文が効果を持たないだけなので、warning の定義に当たる。
   この線で分けると、本設計の 4 コードは次のように揃う:

   | 性質 | 例 | register |
   | --- | --- | --- |
   | malformed（読めない） | `until: 2026-12-31` | error |
   | 矛盾（同じキーに 2 つの値） | `@deprecated(until: "a") @deprecated(until: "b")` | error |
   | 冗長（同じ名前が 2 回） | `@deprecated @deprecated` | warning |
   | 読めるが効果がない | `@deprecated(reason: "x")` | warning（既存） |

**ただし案2-B は記録済みの前提（Issue 本文の register の見込みと、ADR-2571 決定 4 が述べた `fmt` の帰結）を変えるので、
メンテナの判断を要する**。案2-A を選ぶ場合は、`fmt --write` が読めない値を消すことを spec に明記し、
案3-A を却下した理由とどう両立するかを ADR に書く。

なお未対応キーも `fmt --write` で消える（`@deprecated(reason: "x")` は `@deprecated` になる）。これは ADR-1568 の
「警告して破棄する」に基づく既存の挙動で、本設計の範囲外とする。

### Part 3: 同名アノテーションの occurrence を表現できない

#### 案3-A: `duplicate-annotation`（warning）を出すだけ

**メリット**: 実装が最小。スキーマを触らない。

**デメリット**: 警告は `fmt` を止めない。`karasu fmt --write` は今日どおり著者の `2026-Q3` を
`2027-Q3` で上書きする。**データ損失を告知するだけで、止めない。**

#### 案3-B: 名前の重複は warning、同じキーに異なる値が来たら error（推奨）

- `duplicate-annotation`（warning）: 同じアノテーション名を同一ホストに 2 回以上書いた。2 つ目は効果を持たない。
- `annotation-param-conflict`（error）: 同名アノテーションの 2 つの occurrence が同じキーに**異なる値**を与えた。AST は両方を保持できない。

error にすると `fmt` は既存の parse-error ゲート（`Cannot format: source contains parse errors`）で
**書き込みを拒否する**。著者のファイルは守られる。

**メリット**

- データ損失が実際に止まる。スキーマ移行なしで
- 矛盾入力（同じキーに 2 つの値）にだけ error を使うので、無害な `@deprecated @deprecated` は warning のまま
- `duplicate-boundary-id`（error）という「同じものを 2 回宣言したら error」の先例がある

**デメリット**

- 新規コードが 2 つ増える（Part 2 と合わせて計 3 つ）
- Part 2 の register と論理を揃える必要がある（案2-A を選ぶと、同じ「告知か停止か」の問いに Part 2 と Part 3 で逆の答えを出すことになる）
- 矛盾を「表現できないから error」と言っているので、将来 AST が表現できるようになったら register を下げることになる

#### 案3-C: `annotationParams` を per-occurrence 表現に変える

**メリット**

- 忠実。TPL-1101 が #2650 について記録した対処パターン（**AST が境界を捨てていると formatter はどう書いても復元できないので、対処は formatter ではなく AST 側に入る**）にそのまま当てはまる。長期的にはこれが正しい終点

**デメリット**

- スキーマ移行。型 2 箇所・parser 5 箇所・formatter・`getMigrationIntent` / `getDraftState` / `compile.ts`、および `types/` を走査する網羅性テストに波及する
- ADR-2571 が「それ自体が ADR を要する」と分離した範囲そのもの
- 同名アノテーションを別々のパラメータ付きで書くユースケースの実需要が観測されていない。矛盾入力を忠実に表現するためだけにスキーマを動かすことになる

## 比較

| 観点 | 案1-A（lexer + 1 トークン規則） | 案1-B（parser のみ） | 案1-C（縫合して受理） |
| --- | --- | --- | --- |
| headline（`2026-12-31`）の解決 | ○ | ○ | ○（受理する形で） |
| `2026abc` の捏造 | ○ 解決 | × 残る | × 残る |
| `A -> 2B` の付け替え | ○ 解決（error） | × 残る | × 残る |
| `[2026]` / `service 2Foo` の黙殺 | ○ 解決（警告 / エラー化） | × 残る | × 残る |
| `[team-1]` の分裂（TPL-2509） | ○ 解決（縫合の 1 行と対で） | × 残る | × 残る |
| 受理する言語の変化 | タグのみ広がる（`tag-not-builtin` 付き） | 変わらない | 値ポジションが**広がる**（spec 変更） |
| `fmt` との整合 | `needsQuotes()` 1 つに収束 | 同左（1 ポジションのみ） | 受理直後に書き換えが起きる |
| 変更量 | lexer 小 + parser 小 | parser 小 | parser 小 + spec |

| 観点 | 案3-A（warning のみ） | 案3-B（warning + conflict error） | 案3-C（per-occurrence AST） |
| --- | --- | --- | --- |
| `fmt` による上書きを止める | × | ○ | ○ |
| 新規診断コード | 1 | 2 | 0〜1 |
| スキーマ移行 | なし | なし | あり |
| 矛盾入力の忠実な表現 | × | ×（拒否する） | ○ |

## 現時点の方針

**案1-A（kebab 断片の縫合を含む）+ Part 2 の新規診断（register は案2-B を推奨、要判断）+ 案3-B を採用する。**

Part 1 を lexer で直すのは、`needsQuotes()` と lexer の不一致こそが TPL-1101 の記録する root cause だからである。
縫合の 1 行を同じ変更に含めるのは、lexer だけを変えると `[team-1]` の分裂が悪化するためである。
parser 側だけの案1-B は headline を消すが、`until: 2026abc` が `"abc"` を捏造する経路を残す。
これは ADR-2571 が「落とすのがバグなら捏造はより悪い」と書いた形そのものなので、残す選択はしない。
案1-C（縫合して受理）を採らないのは、TPL-2509 の縫合規則が **名前ポジション**の規約であり、
値ポジションはノード参照（`from`）か表示専用文字列（`until` / `confidence`）で、いずれも
「裸で書ける形」は `needsQuotes()` が定義済みだからである。受理しても `fmt` が引用符つきに戻すので、
著者に差分を出す以外の効果がない。

Part 3 で案3-C（per-occurrence AST）を今回採らないのは、実需要が観測されていない一方で
スキーマ移行のコストが確定しているためである。ただし TPL-1101 の #2650 パターンに照らせば
**最終的な対処は AST 側**であることを ADR に明記し、後継 Issue として残す。案3-B はその間、
データ損失を告知ではなく停止で防ぐ。Part 2 で案2-B を推奨するのも同じ理由である。

スライスには割らず 1 PR で出す。Part 1 と Part 2 は `parseAnnotations` の同じ数行を触り、
Part 3 も同じ関数の外側ループに入る。spec の同じ節（`docs/spec/tags-annotations.md`
§ Annotation parameters）と診断カタログを 3 回書き換えるより、1 回で書いたほうが doc の churn が小さい。

### 実装の指針

1. **lexer**: `types/tokens.ts` に `TokenType.Number` を足し、`lexer.ts` の `readToken` の `default` 節に
   digit 始まりの分岐を置く。`[0-9][\p{L}\p{N}_]*` の run を 1 トークンにする（`2026abc` は 1 つの
   `Number("2026abc")`。run を途中で切ると診断の範囲が実際に書かれた語より短くなる）。
   `// Skip unknown character` のコメントを、**何を捨てていて何を捨てなくなったか**（`=` / `;` は黙認継続、
   数字は捨てない）を述べる形に書き換える。
   同じ変更で `kebab-name.ts` の `isWordToken` が `Number` を先頭以外の断片として受ける。
   `[team-1]` / `@phase-2` / `capability p2p-2` の parser テストと、`[team-1]` に `.krs.style` の同綴りセレクタが
   当たる resolver テストを足す（TPL-2509 のテストの書き方）。
2. **lexer のドリフトガード**: examples と `docs/**` の `krs` fence をトークン化し、
   どのトークンにも覆われない非空白文字が `TOLERATED_DISCARDS = { "=", ";", "<", ">" }` の外に無いことを
   assert するテストを足す。数字が再び捨てられたらこのテストが落ちる。負のテスト（数字分岐を外すと落ちること）で
   空振りしていないことを確認する。
3. **parser**: `parseAnnotations` の値読みを「1 トークンで読み切れ、次が `,` / `)` / EOF」に変える。
   満たさないものは `annotation-param-value-unreadable`（register は本 PR のレビューで決める。推奨は error）を
   1 件出し、次の区切りまで消費し、何も記録しない。誤ったキー名の `annotation-param-unsupported` は出さない。
   受理条件が `needsQuotes()` の裏返しであることをコメントで明示し、両者が同じ集合を指すことを
   property テストで固定する（formatter が裸で出す値は parser が同じ値として読み戻せる）。
4. **parser（Part 3）**: 同一ホストのアノテーション名の重複を検出して `duplicate-annotation`（warning）。
   同名 occurrence が同じキーに異なる値を与えたら `annotation-param-conflict`（error）。
5. **診断カタログ**: `types/ast.ts` の code union、`packages/i18n` の `en.ts` / `ja.ts` /
   `render-diagnostic.ts`、`docs/spec/diagnostics.md` / `diagnostics.ja.md` の
   「Annotation & lifecycle」表に 3 行を足す。
6. **spec**: `docs/spec/tags-annotations.md`（en/ja）§ Annotation parameters に
   「裸で書ける値の形」（`needsQuotes()` と同じ集合）と、重複アノテーションの扱いを書く。
   拒否される綴りは、案2-B なら ` ```krs invalid `（lint が error のまま保たれることを検証する）、
   案2-A なら ` ```krs fragment ` か表で示す。
   同じコミットで `pnpm run lint:skill-reference-bundle-sync --write`。
7. **TPL**: 既存 TPL への back-ref で足りるか、proactive TPL を 1 件起こすかを実装時に判断する。
   候補の観点は「**lexer が入力文字を黙って捨てると、下流には拒否する手がかりが残らない**」で、
   TPL-1101（formatter との一致）・TPL-1503（受理と効果）のどちらにも完全には含まれていない。
8. **AT**: `docs/acceptance/2707-annotation-param-value.md`。TC は:
   - `@deprecated(until: 2026-12-31)` に `annotation-param-value-unreadable` が 1 件だけ出て、`annotation-param-unsupported` が出ないこと
   - 同じ入力に `karasu fmt --write` をかけたとき、`until: "-"` が書き込まれないこと。
     案2-B なら**ファイルがそのまま残り、エラー終了する**こと（案2-A なら `@deprecated` が書き込まれること）
   - `until: "2026-12-31"`（引用符あり）は無警告で round-trip すること
   - `@deprecated(until: "2026-Q3") @deprecated(until: "2027-Q3")` に対し `karasu fmt --write` が
     ファイルを書き換えずエラー終了すること
   - `service A [2026]` が `tag-not-builtin` 警告つきでタグとして残ること
   - `service A [team-1]` が 1 つのタグ `team-1` になり、`.krs.style` の `[team-1]` セレクタが当たること
   - `A -> 2B` が既存の `B` へのエッジにならず、error が出ること
9. **changeset**: `@karasu-tools/core` / `karasu` の patch。
10. **ADR 昇格**: 実装完了後に `docs/adr/2707-annotation-param-value-lexing.md` として昇格し、
    本 Design Doc を同じ PR で削除する。ADR には「per-occurrence AST が最終的な対処である」ことと
    その後継 Issue を記録する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 引用符なしの `until: 2026-12-31` を書いたまま `fmt` をかけていないファイルは、
  修正後に `fmt --write` をかけると、案2-B では書き込みが拒否され、案2-A では `@deprecated` になる。
  すでに `until: "-"` が焼き込まれたファイルは引用符つき文字列なので、そのまま `"-"` という opaque な値として残る。
  自動マイグレーションは行わない（診断が出ない形なので検出できない）。
- **壊れた入力に対する診断の増加**: `service 2Foo` / `A -> 2B` が沈黙からエラーに、`[2026]` が消滅から
  警告つきのタグに変わる。`A -> 2B` は今日「正しく見える図」を描いていたので、error が出て初めて
  誤りに気づくファイルがありうる。examples とドキュメントには 1 件も該当がないことを実測済み。
- **ドキュメント更新**: `docs/spec/tags-annotations.md`（en/ja）、`docs/spec/diagnostics.md`（en/ja）、
  skill バンドルのコピー 2 ファイル。
- **テスト・examples への影響**: なし（数字のトークン化と縫合の 1 行を当てた状態で core 4409 テストが無改変で pass）。

## 未解決の問い / 決めないこと

- **`annotation-param-value-unreadable` の register（案2-A / 案2-B）** は本 PR のレビューで決める。
  推奨は案2-B（error）だが、Issue 本文の見込みと ADR-2571 決定 4 の帰結から外れるため、メンテナの判断を要する。
- **`=` と `;` の黙認をどうするか**は決めない。ドキュメント（`docs/spec/syntax.md:131` と acceptance 記録）が
  使っており、トークン化すると doc fence と古い fixture が壊れる。本設計のドリフトガードは
  この 2 文字を明示的な許容リストに置くので、**新しく黙殺される文字が増えたときには落ちる**。
- **per-occurrence な `annotationParams`（案3-C）** は後継 Issue に送る。TPL-1101 の #2650 パターンから
  最終的な対処はこれだと判断しているが、実需要が観測されるまでスキーマは動かさない。
- **`TokenType.Number` という名前**: `2026abc` も 1 つの `Number` になるので厳密には数値ではない。
  `Unknown` / `InvalidWord` も候補だが、`Number` は lexer の慣用であり、将来数値を取る
  プロパティが増えたときに素直に再利用できる。実装時にレビューで確定する。
