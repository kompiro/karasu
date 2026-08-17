# エッジ label のプロパティ形式（`A -> B { label "..." }`）

- **日付**: 2026-08-17
- **ステータス**: 検討中
- **Issue**: [#2209](https://github.com/kompiro/karasu/issues/2209)
- **PR**: [#2541](https://github.com/kompiro/karasu/pull/2541)
- **関連**:
  - [ADR-19](../adr/19-required-id-label-as-property.md): id 必須化・label のプロパティ化（本 doc が閉じる残課題の出典）
  - [ADR-2208](../adr/2208-positional-label-error-promotion.md): organization / team / member の positional label を error 化（兄弟決定）
  - [ADR-1096](../adr/1096-edge-id-selector.md): `edge#<id>` セレクタ（案C で label を edge の identity に使う案を却下）
  - [ADR-1314](../adr/1314-krs-spec-v1-freeze.md): `.krs` v1.0 凍結（本 doc の最大の制約）
  - [ADR-438](../adr/438-krs-formatter.md): `.krs` フォーマッター（ADR-19 の時点では存在しなかった）
  - [ADR-2065](../adr/2065-tags-and-facets.md) / [ADR-2173](../adr/2173-facet-grammar-and-model.md) / [ADR-2174](../adr/2174-facet-overlay.md): facet の register・文法・overlay（エッジ除外の出典）
  - コード: `packages/core/src/parser/parser.ts`（`parseEdge`）、`packages/core/src/formatter/formatter.ts`（`renderEdge`）、`packages/core/src/types/ast.ts`（`KrsEdge`）

## 背景・課題

ADR-19 は id を必須にし `label` をプロパティに移した。その残課題節が唯一残しているのが
エッジの inline label である。

> ## 残課題
> - エッジの inline label（`A -> B "label"` 構文のプロパティ化）は別 Issue で扱う

node 系の位置引数 label は #2133 と #2208（[ADR-2208](../adr/2208-positional-label-error-promotion.md)）で撤去され、
言語に残る位置引数 label はエッジのものだけになった。#2209 はこの最後の 1 つを扱う Issue である。

ただしエッジの label は、撤去済みの 3 つとは前提がまったく違う。撤去できたのは
**spec に載ったことのない parser の leniency** だったからで（[TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) が指す drift）、
撤去は凍結 spec への準拠だった。エッジの label は spec に載っており、
[ADR-1314](../adr/1314-krs-spec-v1-freeze.md) が凍結した面そのものである。しかも代替表記が今日は存在しない。

したがって #2209 は「同じ掃除の最後の 1 件」ではない。**エッジの label を位置引数のまま
仕様として認めるかどうかを決め直す**のが本題で、ADR-19 の判断をエッジについて再評価する
ことになる。

## 現状（インベントリ）

実測は `main`（eff605f7）に対して行った。

| 観点 | 現状 |
| --- | --- |
| 受理形 | `<from> <arrow> <to> ["label"] [tags] [#id]`（`parseEdge`、`parser.ts:1755`） |
| block 形 | `A -> B { label "calls" }` は **parse error**（`unexpected-token-in-block` + `unexpected-token-root`）。label は落ち、`#id` だけは block より前にあるので拾われる |
| `KrsEdge` のフィールド | `from` / `to` / `label` / `kind` / `tags` / `authorId` / `canonicalId` / `syntheticLabel` / `cyclic`。**`description` も `link` も無い** |
| spec 記載 | `docs/spec/syntax.md`「Edge declaration」の文法行そのもの（`<from_id> -> <to_id> "<label>"`） |
| `parseEdge` の呼び出し元 | 5 箇所すべてが同一関数を通る（top-level 誤配置・implicit source・system 内・infra block 内・leaf node 内）。変更点は 1 つで済む |
| `examples/**` の実測 | 84 ファイル / edge 284 本のうち、**282 本が著者の書いた label を持つ**（55 ファイル） |
| `docs/**` の実測 | 位置引数 label を含む行が 147（guide 62 / spec 22 / acceptance 系 30 ほか。grep 実測） |
| 合成 label | resolver が `"N domain edges"` と `R` / `W` を AST の `label` に書く（`view-extract.ts`、`syntheticLabel: true`）。表層構文を通らない |
| facet 所属 | `facets` は `BaseNodeFields` のプロパティで、**エッジは持てない**。`docs/spec/syntax.md:1394`「Edges do not take `facets` in v1」、`docs/spec/style.md:84`「`edge[facets=...]` は何にもマッチしない」 |
| facet 除外の根拠 | [ADR-2065](../adr/2065-tags-and-facets.md) / [ADR-2173](../adr/2173-facet-grammar-and-model.md) / [ADR-2174](../adr/2174-facet-overlay.md) は **edge に一度も言及していない**（grep 実測 0 件）。除外の理由は記録されていない |

3 点、Issue 起票時および spec の前提と食い違ったので置き換える。

- `examples/` の出現は 232 行ではなく **282 本**（parser で数え直した）。edge 284 本中 282 本なので、
  **label が付いていないエッジの方が例外**である。
- roadmap の gap 表は edge の protocol / cardinality を「当面 tag + `description`/`link` の散文に
  逃がす」と書いているが、**エッジに `description` も `link` も無い**。逃がし先として書かれた
  ものが実装されていない。
- spec は facet について「Membership is imposed from outside the architecture, so no kind is
  structurally excluded」と書いた直後に「Edges do not take `facets` in v1」と続ける。
  ADR に理由が無いことと合わせると、この除外は**原理ではなく、エッジにプロパティを書く場所が
  無かったという構文上の都合**だと読める。block 形はその都合を取り除く。

## 制約・前提

- **[ADR-1314](../adr/1314-krs-spec-v1-freeze.md) の凍結**: 「既存の妥当な `.krs` は v1.x の間 parse し続ける」。
  位置引数形の撤去は v1.x では実行できず、v2.0 を切る必要がある。#2133 / #2208 が使えた
  「spec に無い形だから撤去は準拠である」という論法は、ここでは使えない。
- **[ADR-19](../adr/19-required-id-label-as-property.md) 案C（位置引数 OR プロパティの両対応）は却下済み**。
  理由は「パーサーが複雑化し、どちらを使えばいいかでユーザーが迷う」。両対応を採るなら
  この却下を覆す根拠が要る。
- **[ADR-1096](../adr/1096-edge-id-selector.md) 案C（label を edge identity の tie-break に使う）も却下済み**。
  つまりエッジの label は参照キーではない。ADR-19 が node で問題視した「label 変更が参照を壊す」は
  エッジには構造的に起こらない。
- **[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)**: 表記形が 2 つになるなら
  `karasu fmt` はどちらか 1 つに畳む必要があり、その規則は単一の判定条件で書けなければならない。
- **[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)**: 同じ事実に
  2 つの表現を持たせない。label しか書けない block を足すのは、能力を増やさずに表記だけ増やすことになる。
- **[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)**: 新たに受理する
  語彙は可視の効果を持たなければならない。block に `description` / `link` を入れるなら、どこかに出す必要がある。
- **facet のエッジ除外は spec 2 文で明文化されている**（`docs/spec/syntax.md:1394`、`docs/spec/style.md:84`）。
  受理形が増える方向なので追加的変更として v1.x で許されるが、spec 文の書き換えを伴う以上、
  「なぜ v1 で除外したのか」を確認したうえで覆す必要がある。ADR 側に記録は無い（[§現状](#現状インベントリ)）。
- **out of scope**: エッジの protocol / cardinality の first-class 化（roadmap gap D、据え置き中）。
  本 doc は「置き場所を作るか」までで、その 2 つを語彙として増やすことはしない。

### 文法上の安全性

`parseEdge` の末尾で `{` を覗くだけで block 形を足せる。`{` で始まる構文は他に無く、
lexer は改行を無視するが、エッジの直後の行に単独の `{` が来る妥当なファイルは存在しない。
つまり block 形の追加は既存ファイルの解釈を変えない（追加的変更 = v1.x で許可）。

## 検討した選択肢

### 案1: block 形を入れ、位置引数形を deprecate する（Issue の提案）

`A -> B { label "calls" }` を導入し、`A -> B "calls"` は v1.x で warning、v2.0 で error にする。
`karasu fmt` に書き換えを実装し、corpus を移行する。

**メリット**

- ADR-19 の「label はプロパティ」を言語全体に貫ける。説明が 1 行で済む。
- 表記が 1 つに定まる。

**デメリット**

- v1.x では deprecate までしかできず、決着は時期未定の v2.0 に預かる（[§Syntax 2.0 プログラム](../roadmap.md#syntax-20-プログラム)）。
- 移行の対象が 429 箇所（examples 282 + docs 147）。しかも**言語で最も打鍵される構文**を書き換える。
- 得られるものが uniformity だけで、書ける内容は 1 文字も増えない。
- `A -> B { label "calls" }` は `A -> B "calls"` より明確に読みにくい。node と違い、エッジの
  label は表示名ではなく関係そのもの（動詞）なので、位置引数であることに意味がある。

### 案2: block を「shorthand で書けないもの」の受け皿として additive に足し、位置引数形は正式な shorthand として残す

```
// 提案する形。この block 形は現行の parser では通らない
A -> B "calls"                                  // shorthand（従来どおり、正式）
A -> B [async] #orderPlaced {                   // block: label 以外を書きたいときだけ
  label "places an order"
  description "At-least-once. Retries are idempotent on orderId."
  link "Runbook" "https://..."
  facets pii, pci_scope
}
```

- block が受け付けるのは `label` / `description` / `link` / `facets` の 4 つ。tags と `#id` は
  node と同じく block の外側に置く（`service A [external] { label "..." }` と同形）。
- 位置引数と block の両方に `label` を書いたら error（`duplicate-edge-label`）。片方を黙って勝たせない。
- `karasu fmt` の canonical 化の判定条件は 1 つ、**block が `label` 以外を持つか**。持たなければ
  shorthand に畳み、持てば block にまとめる（`label` も block 側へ）。
- ADR-19 を supersede せず、**エッジについて refine する** ADR を新たに起こす。

`facets` を含めるのは、エッジが facet から外れている理由が原理ではなく構文上の都合だからである
（[§現状](#現状インベントリ)）。PII を運ぶデータフロー、PCI スコープに入る通信といった
「エッジ自身が概念に属する」事実は facet の典型例で、今日は端点の node に付けて代用するしかない。
これは所属の場所を偽ることになる。ただし spec の 2 文（`syntax.md` の「Edges do not take `facets`
in v1」、`style.md` の「`edge[facets=...]` は何にもマッチしない」）の改訂を伴うため、
**受理とその効果（overlay・セレクタ・検証）は同一スライスで出す**（[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)）。

**メリット**

- 破壊的変更が無い。corpus 移行が 0 件で、v2.0 を待たずに今日決着する。
- 実際に足りていないもの（`description` / `link` / `facets` の置き場所）が埋まる。roadmap gap D の
  「散文に逃がす」が初めて実行可能になり、facet の「no kind is structurally excluded」も
  エッジまで届く。
- shorthand が読みやすいまま残る。282/284 のエッジが今の書き方を続けられる。
- ADR-19 案C の懸念（どちらを使うか迷う）に機械的な答えを出せる。ADR-19 は 2026-03-23、
  フォーマッター（[ADR-438](../adr/438-krs-formatter.md)）は 2026-04-10 で、**却下の時点では fmt が存在しなかった**。

**デメリット**

- 表記形が 2 つになる。ADR-19 案C の却下を部分的に覆すことになり、根拠を残す必要がある。
- `description` / `link` を受理する以上、可視の効果を用意しないと [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) 違反になる。
  現状 `EdgeDetailPanel` は集約 domain edge 専用なので、通常エッジへ広げる作業が要る。
- `facets` をエッジに広げると、overlay（[ADR-2174](../adr/2174-facet-overlay.md)）・`[facets=<id>]` セレクタ・
  `facet-not-declared` の検証・`FacetOverviewPanel` の導出リストがすべてエッジを含む必要がある。
  facet 所属は node id で keying されている（`facetMembership`）ため、エッジ側の鍵をどうするかも決める必要がある
  （`canonicalId` は base 衝突時に `undefined` になりうる。[ADR-1096](../adr/1096-edge-id-selector.md)）。
- parser / formatter / LSP / in-app Reference（[TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md)）の
  更新が必要で、案3 より確実に重い。

### 案3: block を入れず、位置引数形を仕様として追認する

新構文を足さない。ADR-19 の残課題を「エッジは位置引数 label を正式形とする」という決定で閉じる。

**メリット**

- 実装ゼロ、リスクゼロ。今日 ADR 1 本で閉じられる。
- 282/284 の実績が正当化になる。

**デメリット**

- `description` / `link` の置き場所が無いままになる。次に要望が出た時点で同じ議論をやり直す。
- そのとき取れる手は「位置引数のスロットを増やす」しかなく、
  `A -> B "label" [tags] #id` は既に 4 スロットの位置引数行である。5 つ目は明確に悪化する。

### 案4: 何もせず v2.0 まで持ち越す

ADR-19 の残課題を open のままにし、Syntax 2.0 プログラムの一部として扱う。

**メリット**

- 判断を先送りできる。

**デメリット**

- Syntax 2.0 は時期未定。残課題が最長で無期限に開いたままになる。
- 先送りしても情報は増えない。判断材料（凍結面・corpus・ADR-1096 の identity 決定）は既に揃っている。

## 比較

| 観点 | 案1（deprecate） | 案2（additive block） | 案3（追認） | 案4（先送り） |
| --- | --- | --- | --- | --- |
| 後方互換 | 破壊（v2.0 必須） | 保つ | 保つ | 保つ |
| corpus 移行 | 429 箇所 | 0 | 0 | 0 |
| 決着時期 | v2.0（時期未定） | v1.x（今） | v1.x（今） | 未定 |
| `description` / `link` / `facets` の置き場所 | できる | できる | できない | できない |
| 表記形の数 | 1 | 2（fmt が畳む） | 1 | 1 |
| 実装コスト | 大（parser + fmt + 移行 + 診断） | 中（parser + fmt + 可視化 + facet 拡張 + docs） | ゼロ | ゼロ |
| ADR-19 との関係 | 貫徹 | エッジについて refine | エッジについて refine | 未解決のまま |

## Related TPLs

- [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md): `parse(format(x)) ≡ parse(x)`。
  表記形が 2 つになるので、両形式が同じ AST に落ちること・fmt が 1 つに畳むことを固定する。
- [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md): 同じ事実の二重表現。
  案2 が「label だけの block」で止まるとこれに抵触する。block は shorthand で書けないものを
  伴って初めて成立する。
- [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md): 受理語彙は
  可視の効果を持つ。エッジの `description` / `link` / `facets` は parse-and-vanish にしない。
  スライスの切り方（受理と効果を同じスライスに置く）はこの観点から決めた。
- [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md): parser が受理する形は
  spec に載せる。block 形を足したら spec の文法行を同 PR で更新する。
- [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md): 宣言可能な構文は
  in-app Reference から到達できる。`REFERENCE_DATA` にエッジの block を載せる。
- [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md): overlay は opt-in で、
  facet 未選択なら出力は byte-identical。エッジを overlay の対象に加えても、この不変条件を崩さない。
- [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md): `facets` は cross-reference なので、
  エッジ側も resolver での検証（`facet-not-declared`）を伴う。parser の受理だけで終えない。
- [TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md): その検証は
  merged model 上で行う。宣言と参照が別ファイルにありうる。
- [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md): エッジの
  facet 所属も 1:N。導出インデックスで 1 つに畳まない。

**起票予定の proactive TPL（案2 採用時、スライス A と同 PR）**: 「1 つの事実に複数の表記形を認めるなら、
全表記形が同じ AST に落ちることと fmt が 1 形に畳むことを対で固定する」。TPL-1101（変換の意味保存）と
TPL-1415（内部表現の二重化）の間に落ちる観点で、`boundary` の 2 形式や `usecase` の `resource` 行など
横展開先があり、構造的に再発しうる。3-Yes を満たす。

## 現時点の方針

**案2 を採用する。**

理由は 4 つ。

1. **ADR-19 の中核理由がエッジに転移しない。** ADR-19 が解いたのは `node.id ?? node.label` の
   フォールバックと「label が参照キーになる」壊れやすさで、どちらもエッジには存在しない。
   [ADR-1096](../adr/1096-edge-id-selector.md) が案C（label を tie-break に使う）を却下した時点で、
   エッジの label が identity に触れないことは決着済みである。残る論拠は表記の対称性だけになる。
2. **案1 は v1.x では実行できず、v2.0 で払う対価が大きすぎる。** 凍結面を破って得られるのが
   uniformity のみで、代償は 429 箇所の移行と、言語で最も打鍵される構文の可読性低下である。
   282/284 という比率は、この構文が周辺的な糖衣ではなく主要な書き味であることを示している。
3. **実需は「label の書き方」ではなく「label 以外の置き場所が無いこと」。** roadmap gap D は
   protocol / cardinality を `description` / `link` の散文へ逃がす前提で据え置いたのに、
   エッジにはその 2 つが無い。案2 はこの穴を埋め、案1 / 案3 は埋めない（案1 は表記を変えるだけ）。
4. **facet の除外も同じ穴に由来する。** spec は「no kind is structurally excluded」と書いた直後に
   エッジを除外しており、ADR 側に理由の記録が無い。書く場所が無かったから外れていたのであって、
   エッジが概念に属さないからではない。block はこの除外を原理に基づいて解消する。
5. **ADR-19 案C の却下理由には期限付きの前提があった。** 「どちらを使えばいいか迷う」は
   フォーマッターが無かった 2026-03 の話で、`karasu fmt` は 2026-04 に入った。今は
   「block が `label` 以外を持つか」という単一条件で機械的に答えが出る。

つまり ADR-19 を覆すのではなく、**node とエッジは別物であるとして ADR-19 をエッジについて refine する**。
新 ADR は ADR-19 を `supersedes` せず `depends_on` で結ぶ。

### スライス（実装ステップ）

> sub-issue の起票と親 Issue の `## Slice status` 表は、本 doc の方針が承認されてから行う
> （`.claude/rules/program-slices.md`）。承認前に割ると、方針変更でそのまま無効になる。

切り方の判定条件は 1 つ、**受理する語彙とその可視の効果を同じスライスに入れる**こと
（[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)）。
parser だけ先に出すと、中間状態が parse-and-vanish になる。

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** block 形 + `label` / `description` / `link`（parser・AST・`duplicate-edge-label`・fmt の canonical 化・`EdgeDetailPanel` の通常エッジ対応・SVG の data 属性・spec / Reference 更新） | — | shorthand の挙動が変わらないので、block を書かないファイルの図・診断・出力は 1 バイトも動かない。facet 側に一切触れないため、B を待たずに完結している |
| **B** エッジの `facets`（parser 受理 + overlay 対象化 + `[facets=<id>]` セレクタ + `facet-not-declared` + `FacetOverviewPanel` + spec 2 文の改訂） | A | A が block という置き場所を作って初めて成立する。B 単体で facet 側の不変条件（未選択なら byte-identical、[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)）を保ったまま出せる |

### 実装の指針

**スライス A**

1. `parseEdge` 末尾で `{` を覗き、あれば block を読む。受理するのは `label` / `description` / `link`。
   それ以外は `unexpected-token-in-block`（`construct: "edge"`）。`{` で始まる構文は他に無く、
   エッジの直後に単独の `{` が来る妥当なファイルも存在しないので、既存ファイルの解釈は変わらない。
2. `KrsEdge` に `description?` / `link?` を足す。`syntheticLabel` の扱いは変えない
   （resolver の合成 label は表層構文を通らないので影響なし）。
3. 位置引数と block の双方に `label` があれば `duplicate-edge-label`（error）。黙って片方を勝たせない。
4. `renderEdge` を canonical 化する。判定条件は「block が `label` 以外を持つか」の 1 つだけ。
   round-trip テストは両形式から同一 AST が出ることと、fmt が冪等であることを固定する。
5. `EdgeDetailPanel` を通常エッジへ広げ、`description` / `link` を出す。SVG 側は
   `data-edge-label` に倣った data 属性を足す。
6. `docs/spec/syntax.md` / `.ja.md` の「Edge declaration」に block 形を追記し、
   章末の `> Related TPLs:` に proactive TPL の back-ref を置く（`.claude/rules/spec-audit.md`）。
   in-app Reference の `REFERENCE_DATA` にも載せる。

**スライス B**

7. `facets` をエッジの block で受理し、`facet-not-declared` を merged model 上で検証する。
8. overlay の所属 keying を決める。`facetMembership` は node id 引きだが、エッジの `canonicalId` は
   base 衝突時に `undefined` になりうる（[ADR-1096](../adr/1096-edge-id-selector.md)）。id 引きの map に寄せず、
   layout が持つエッジ実体から所属を解決する方針を第一候補にする。
9. `docs/spec/syntax.md` の「Edges do not take `facets` in v1」と
   `docs/spec/style.md` の「`edge[facets=...]` は何にもマッチしない」を改訂する。
   どちらも「受理形が増える」方向なので追加的変更だが、spec 文の書き換えなので同 PR で行う。

**共通**

10. AT: `docs/acceptance/` に新規ファイル。TC は次を含める。
    - shorthand と block が同一の AST・同一の SVG を生む
    - `karasu fmt` が label のみの block を shorthand に畳み、`description` を持つ block はそのまま保つ
    - 位置引数 + block の二重 label が `duplicate-edge-label` になる
    - `#id` と tags が block と共存する（`A -> B [async] #id { ... }`）
    - block を含む `.krs` が round-trip する
    - エッジに `facets` を書いて overlay で選択すると、そのエッジが highlight される
    - facet を 1 つも選ばなければ、`facets` 付きエッジを含むファイルの SVG が従来と byte-identical
11. ADR 昇格: 実装完了後に `docs/adr/2209-edge-label-property-form.md` として昇格し、
    本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: なし。追加的変更であり、既存の `.krs` の解釈は変わらない。
  facet 未選択時の SVG は byte-identical のまま（[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)）。
- **ドキュメント更新**: `docs/spec/syntax.md` / `.ja.md`（Edge declaration に block 形、facet 節の
  「Edges do not take `facets` in v1」の改訂）、`docs/spec/style.md`（`edge[facets=...]` の注記の改訂）、
  `docs/guide/notation-cookbook.md` / `.ja.md`、in-app Reference（`REFERENCE_DATA`）。
  `docs/roadmap.md` gap D の「`description`/`link` の散文に逃がす」はスライス A 完了時点で初めて
  事実になるので、その旨を出典セルに反映する。
- **テスト・examples への影響**: `examples/**` の書き換えは不要。block 形を実演する例を
  `examples/en/feature-samples/edges.krs` と `ja` 側に 1 つずつ足す程度（`/update-examples` 経由で
  `examples.ts` も同 commit で同期する）。facet の実演は
  `examples/en/feature-samples/tag-facet-registers.krs` に寄せる。
- **changeset**: `@karasu-tools/core` の minor（言語 v1.x の追加的変更）。言語版の遷移は無い。

## 未解決の問い

- **`link` の形（`link "ラベル" "URL"`）をエッジでもそのまま使うか。** node 側の `link` 構文に
  合わせる前提で書いたが、エッジで複数 link を許すかは未検討。node は複数持てる（`properties.links`）ので
  揃えるのが素直だが、エッジの詳細パネルに何本まで出すかは B の UX 次第。
- **エッジ選択の UX。** `EdgeDetailPanel` を通常エッジへ広げるにあたり、クリック判定と
  `EdgeContextMenu` との関係を詰める必要がある。スライス A の実装時に決める。
- **合成エッジの facet 所属。** usecase→resource や集約 domain edge は表層構文を持たないので
  `facets` を書けない。書けないままでよいか（端点の node の所属から導出しない）は
  スライス B で決める。第一候補は「書けないまま」。導出は所属の場所を偽ることになる。
