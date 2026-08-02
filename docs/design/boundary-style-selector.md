# `boundary` フレーム色の style セレクタ

- **日付**: 2026-08-02
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2234](https://github.com/kompiro/karasu/issues/2234)（`epic: boundary` / 親 [#2161](https://github.com/kompiro/karasu/issues/2161)）
  - PoC: `spike/boundary-legend`（not for merge。4 プレートのレンダリング比較と計測は同ブランチの `spike/README.md`）
  - 関連 ADR: [ADR-9004](../adr/9004-css-inspired-styling.md)（CSS インスパイアの styling）、[ADR-833](../adr/833-diagram-legend-syntax.md)（legend 構文。本件が「legend を足さない」と決める相手）、[ADR-1858](../adr/1858-system-view-group-by-team.md) / [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（フレームは全部同じ破線だった時代）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）、[ADR-2124](../adr/2124-version-vocabulary.md)（版語彙）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（promotion gate）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（scoped 宣言 = identity は（宣言スコープ, id））
  - 関連 TPL: [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)（spec doc と reference-data の同期）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（scoped boundary の identity）、[TPL-2179](../test-perspectives/TPL-2179-derived-outline-measured-on-coverage-not-bbox.md)（定義は 1 つ、全 consumer が読む）、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)（style の引き当ては layout の id 形と一致させる）
  - コード: `packages/core/src/parser/style-parser.ts:199`（`parseSelector`）/ `:547`（`computeSpecificity`）、`packages/core/src/resolver/style-resolver.ts:88`（`resolveStyles`）、`packages/core/src/renderer/svg-renderer.ts`（`renderContainer` / `boundaryHue` / `renderDegradedTabs`）、`packages/core/src/builtins/reference-data.ts:1019`（`SELECTOR_SPECIFICITY`）、`packages/core/src/types/style.ts:17`（`StyleSelector`）

## 背景・課題

[#2179](https://github.com/kompiro/karasu/issues/2179) で boundary のフレームは固定サイクルの識別色を持つようになった。色は著者が選んでいないので、この時点では描画の都合であって著者の主張ではない。

[#2234](https://github.com/kompiro/karasu/issues/2234) は、これを `.krs.style` から指定できるようにしたい、と述べている。監査スコープは赤、といった自分たちの慣習に図を合わせたいという要求で、`.krs.style` が本来担っている「表現の層」の話である。

Issue はあわせて legend での説明も求めていたが、PoC の結果これは不要と判断した（下記「legend を足さない」）。したがって本 Design Doc が扱うのはセレクタ 1 本だけである。

そのうえで本 Design Doc の主目的は、**追加する文法が既存の `.krs.style` と地続きに見えるかを確認すること**にある。`.krs.style` は CSS を模した小さな文法で、セレクタの形・specificity の採点・プロパティの部分集合の扱いに既に一貫した型がある。新しいセレクタが「boundary のためだけの特別扱い」に見えるなら、それは設計を間違えている。以下は既存の慣習を 1 つずつ棚卸しして、提案がそれぞれに乗っているかを検証する形で書く。

## 現状（インベントリ）

### 既存のセレクタの形

`docs/spec/style.md` §Selector types が正典。関係する行を抜き出す。

| セレクタ | 例 | 対象 | 備考 |
| --- | --- | --- | --- |
| Kind | `service` | その kind のノード全部 | `nodeType` に入る |
| ID | `#ECommerce` | 特定ノード 1 つ | `id` に入る |
| Edge | `edge` | エッジ全部 | `nodeType = "edge"`。論理ノードの kind ではない |
| Edge ID | `edge#criticalWrite` | 特定エッジ 1 つ | `edgeId` に入る。`edge` の後の `#` だけを特別扱いする分岐 |
| Org tree | `team` / `member` / `#TeamId` | org view のカード | 別 view。プロパティの部分集合を spec に明記 |

**`edge` が本件の直近の前例**である。論理ノードの kind ではないキーワードが、自分の `#id` 形を持ち、自分の解決結果マップ（`ResolvedStyles.edges`）を持ち、自分のプロパティ部分集合を持つ。`boundary` に必要なものと 1 対 1 で対応する。

### specificity の採点（`computeSpecificity`, style-parser.ts:547）

```ts
if (selector.id) score += 100;
if (selector.edgeId) score += 100;
score += selector.tags.length * 10;
score += selector.annotations.length * 10;
if (selector.edgeFrom !== undefined) score += 10;
if (selector.edgeTo !== undefined) score += 10;
if (selector.nodeType) score += 1;
```

id 系は 100、kind は 1。`edge#criticalWrite` が 101 なのは「100（id）+ 1（kind）」の合成であって、`edge#` 専用の値ではない。

### 表は生成物である

`docs/spec/style.md` の specificity 表は `<!-- gen:reference:selector-specificity -->` で囲まれた生成ブロックで、元データは `reference-data.ts` の `SELECTOR_SPECIFICITY`（en / ja のラベルを持つ）。`pnpm gen:reference` で再生成し、drift はガードされている（TPL-1296）。セレクタを足すなら**表を手で書かず元データに足す**のが既存の作法。

### 解決結果の置き場

`ResolvedStyles` は対象ごとにマップを分けている（`nodes` / `edges` / `layoutHints`）。`renderContainer` は今 `styles.nodes.get(container.id)` を引いていて、boundary フレームの container id は `__group_<id>__` という合成 id なので何も当たらず `defaultNodeStyle` に落ちている。これが「全フレーム同じ破線グレー」の実装上の出どころ。

### プロパティの部分集合をどう書いてきたか

Org tree view の節が前例。「Supported properties」の表を出し、効かないものを `> **Note**: opacity / shape / badge-* は無視される` と明記している。全プロパティが全対象で効くふりをしない。

### 未知セレクタは黙って無効

`WarningKind` に「どのノードにもマッチしなかったセレクタ」に相当するものは無い（`style-conflict` は別概念）。したがって今日 `boundary { ... }` と書くと、**parse は通り、何にもマッチせず、警告も出ない**。TPL-1503 が禁じる「受理・無効果」に隣接した状態が既にある。

### 現在の parse 結果（実測）

`kind#id` の綴りが今どう解釈されるかを `StyleParser.parse` で確認した。`#` を消費する分岐は `edge` にしか無いので、それ以外の kind に `#` を付けると **parse error になる**。

| 入力 | 現在の結果 |
| --- | --- |
| `#Platform` | `id = Platform`、specificity 100。org tree view の team カードに当たる |
| `team` | `nodeType = team`、specificity 1。org tree view の team カード全部 |
| `team#Platform` | **parse error**（`style-token-type-mismatch` / `expected-style-property-name`） |
| `boundary` | `nodeType = boundary`、specificity 1。何にもマッチしない |
| `boundary#pci` | **parse error**（同上） |
| `edge#foo` | `nodeType = edge` + `edgeId = foo`、specificity 101 |

`boundary#pci` も `team#Platform` も現在は書けないので、**どちらを定義しても後方互換の問題は無い**。制約は互換性ではなく意味論の側にある（次節）。

## 制約・前提

- **`boundary` は experimental**（[ADR-1820](../adr/1820-notation-promotion-gate.md)）。本件は昇格ではない。
- **言語版**: `boundary` は [ADR-1314](../adr/1314-krs-spec-v1-freeze.md) の凍結スコープに入っていない。凍結されているのは v1.0 stable の面であり、experimental notation は互換を約束していない。したがって本件は「言語 v1.x への追加」ではなく、**boundary の面の一部として言語 v2.0 に載る**（roadmap の昇格先 = v2.0 core）。今回の変更で言語版は動かないので、changeset に書く言語版遷移も無い。遷移を明記するのは boundary を core 昇格させる回である。
- **legend の語彙は足さない**（下記）。
- **`.krs` 側の文法は変えない**。`boundary` ブロックの書き方は不変で、変わるのは `.krs.style` 側だけ。
- out of scope: team フレーム（`__group_<team>__`）の色指定、facet セレクタ（[#2160](https://github.com/kompiro/karasu/issues/2160) が持つ）、overlap 領域の描き分け（[#2179](https://github.com/kompiro/karasu/issues/2179) で tint に決着済み）、legend。

## legend を足さない（#2234 Part 2 の結論）

Issue は「著者が色を選べるようになったら legend で説明できる必要がある」とし、生成 `legend boundary` ブロックが有力かもしれないと書いていた。`spike/boundary-legend` で 4 プレートを描いて比較した結果、これは**不要**と判断する。

- 生成した legend の行は `Payments` / `PCI scope` / `Risk` となり、**すぐ上のフレームに同じ色で描かれているタイトルと同一の文字列**だった。#2179 でフレームのタイトルが boundary の色を取るようにしたため、legend は図が既に述べていることを言い直すだけになる。縮退タブも `◇ <label>` なので同様。
- 図から復元できない情報を運んでいたのは著者の散文（「PCI scope, regulated, quarterly audit」の後半）だけで、それは `swatch #hex "label"`（[ADR-833](../adr/833-diagram-legend-syntax.md)、言語 v1.0 から存在）で今日書ける。
- したがって新しい ref target も生成ブロックも、凍結された言語に取り消せない語彙を足す割に得るものが無い。

`swatch` 運用に残る弱点は hex が style シートと legend の 2 箇所に載る drift だが、これは boundary 固有の問題ではなく `swatch` 全般の性質であり、boundary のためだけに新語彙を起こす理由にはならない。将来 drift が実利用で問題になったら、`ref` の target に既存のセレクタ文法を流用する案（`ref boundary#pci "..."`）を別 Issue で検討する。本 Design Doc では決めない。

## 検討した選択肢

### 案 1: `boundary` + `boundary#<id>`（採用）

```css
boundary            { border-style: solid; }   /* 全フレーム */
boundary#pci        { border-color: #c0392b; } /* 特定の boundary */
```

`edge` / `edge#<id>` をそのまま写した形。

**メリット**

- 既存の型に完全に乗る。パーサは `edge#<id>` の分岐の隣に同型の分岐を 1 つ足すだけ、specificity は既存の採点式が `boundaryId` に +100 するだけで `boundary#pci` = 101 になり、`edge#criticalWrite` と同じ導出になる。
- 裸の `boundary` に意味が生まれる。今日は parse されて無効果（TPL-1503 隣接）だったものが、全フレーム共通の見た目を変える正当なセレクタになる。
- `#pci` 単独を使わないので node id 空間と衝突しない。

**デメリット**

- `StyleSelector` にフィールドが 1 つ増える（`edgeId` と同じ性質の増え方）。
- scoped boundary（[ADR-2036](../adr/2036-scoped-boundary-declaration.md)、identity =（宣言スコープ, id））をどう指すかを別途決める必要がある（下記「未解決の問い」）。

### 案 2: 裸の `#pci`

**却下**。`#id` は既にノード id を指す。同じ綴りで別の空間を指すと、`boundary pci` と `service pci` が同居したときにどちらを指すか決まらない。Issue 自身も指摘している。

### 案 3: 合成 container id を晒す（`#__group_pci__`）

**却下**。`__group_<id>__` はレイアウトの内部表現で、spec に載せる語彙ではない。scoped boundary では更に scope 修飾が付くので、著者に書かせる形ではない。

### 案 4: 属性セレクタ形（`boundary[id=pci]`）

**却下**。`[from=...]` / `[to=...]` はエッジの**端点**という属性の述語であって、identity ではない。identity には `#` を使うのが既存の一貫性（`#NodeId` / `edge#id`）。

## 比較

| 観点 | 案 1 `boundary#id` | 案 2 裸 `#id` | 案 3 合成 id | 案 4 `[id=]` |
| --- | --- | --- | --- | --- |
| 既存文法との一貫性 | `edge#id` と同型 | id 空間が衝突 | 内部表現の漏出 | 属性 = 述語という既存の使い分けを壊す |
| specificity の導出 | 既存式のまま 101 | 100 だが対象が曖昧 | 100 | 11 になり id なのに tag 並み |
| パーサの変更量 | 分岐 1 つ | 解決時の曖昧性解消が必要 | 0 だが spec 化不可 | 分岐 1 つ + 述語の意味付け |
| scoped boundary への拡張 | 修飾の追加余地あり | 無い | 既に修飾込みで醜い | ある |

## 現時点の方針

**案 1 を採用する。** `edge` の前例が本件と構造的に同一（論理ノードでないキーワード + 自分の `#id` 形 + 自分の解決結果マップ + 自分のプロパティ部分集合）であり、そこに合わせる限り新しい概念は 1 つも増えない。

### 既存慣習との突き合わせ

本 Design Doc の主目的である「違和感が無いか」の検証結果。

| 既存の慣習 | 提案がどう従うか |
| --- | --- |
| identity は `#`、属性は `[k=v]` | `boundary#pci` は identity なので `#` |
| kind は +1、id は +100 | `boundaryId` に +100 を足すだけ。`boundary#pci` = 101 は `edge#criticalWrite` と同じ導出 |
| specificity 表は `reference-data.ts` から生成 | `SELECTOR_SPECIFICITY` に「Boundary」（1）と「Boundary ID」（101）の 2 行を足し、`pnpm gen:reference` で en / ja 両方を再生成する。表を手書きしない（TPL-1296） |
| 解決結果は対象ごとに別マップ | `ResolvedStyles.boundaries` を足す（`nodes` に混ぜない。boundary は node ではないので `#pci` と衝突しない） |
| 効かないプロパティは spec に明記する | 「Boundary frame properties」の表を出し、効くものだけ挙げる。org tree 節と同じ書き方 |
| 未知セレクタは警告しない | 変えない。`boundary#nosuch` が無警告なのは `#NoSuchNode` が無警告なのと同じ |
| spec は en / ja 両方 | `style.md` と `style.ja.md` を同じ PR で更新する |

破っている慣習は無い。唯一の新規性は `.krs` 側の宣言（`boundary` ブロック）が `.krs.style` から名指しされる初めてのケースだが、これは `#NodeId` が `.krs` のノード宣言を名指しているのと同じ関係である。

### team フレームを同じ回で扱わない理由

system view の Group by: team も `__group_<team>__` というフレームを出すので、機構としては同じものが使える。実装コストだけを見れば同じ回で入る。それでも本 Design Doc では扱わず follow-up にする。理由は工数ではなく、**`team` は `boundary` と違って既に style の語彙であり、綴りに競合する自然な読みが存在する**ため。

| | `boundary` | `team` |
| --- | --- | --- |
| その kind のノードは存在するか | しない。boundary はノードではない | **する**。org tree view で team はカード（ノード）である |
| 裸の `#id` が今指すもの | 何も指さない | **org tree の team カード**（specificity 100） |
| `kind#id` の CSS 的に自然な読み | 「edge のうち id が foo」= `edge#foo` と同型。曖昧さ無し | 「kind team かつ id Platform」= 複合セレクタ。つまり `#Platform` の**より具体的な言い換え**であり、指す先はカード |

`boundary#pci` は `edge#foo` と同じく「他に読みようが無いので `#` で id 空間を分ける」形だが、`team#Platform` は素直に読むと**カードを指す複合セレクタ**になる。ここにフレームという別のレンダリングを割り当てると、`#Platform`（カード）と `team#Platform`（フレーム）が同じ team の別の見た目を指す非対称が生まれ、CSS の直感（複合セレクタは対象を絞るのであって別の対象に移らない）と衝突する。

回避するには次のどれかを決める必要があり、いずれも本件より広い議論になる。

- カードとフレームを 1 つのスタイルとして扱う（`#Platform` が両方に効く）。単純だが、塗りつぶしのカードと囲みのフレームで `background-color` の意味が大きく違う。
- フレームを指す別の言い方を導入する（疑似要素相当の `::frame` など）。文法機構が増える。
- team 側だけ別キーワードを充てる。語彙が増える。

`boundary` にはこの分岐が無く、`edge` の前例をなぞるだけで済む。**綴りの決定が要る面と要らない面を 1 つの PR に混ぜると、決まっている方まで止まる**ので分ける。

follow-up 側が再設計にならないことは確認済み。`ResolvedStyles` は対象ごとに別マップという既存の型なので、team が来たときも `nodes` / `edges` / `boundaries` と並べて 1 本足すだけで、`boundaries` の構造を変える必要は無い。逆に今から「軸に依存しない group frame マップ」を用意して抽象化しておくことはしない。team の綴りが決まっていない以上、キーの形（group id だけで足りるのか、軸との組が要るのか）も決まらないためで、使われ方が決まる前の一般化は避ける。

### 効くプロパティ

`ResolvedNodeStyle` のうちフレームに意味があるものだけを開ける。

| プロパティ | 効果 |
| --- | --- |
| `border-color` | 枠線の色。**タイトルと薄い塗りもこの色に追従する** |
| `background-color` | 薄い塗りの色を枠線と別に指定したいときだけ |
| `color` | タイトルの色を枠線と別に指定したいときだけ |
| `border-width` | 枠線の太さ |
| `border-style` | `solid` / `dashed` / `dotted`。既定は `dashed` |

`border-color` に他 2 つを追従させるのは、#2179 が「枠線・薄い塗り・タイトルは 1 つの色である」ことを多重包含の可読性の条件として決めているため。1 つ指定しただけで boundary の identity が 2 色に割れるのは事故になる。個別に上書きしたい著者は `background-color` / `color` を明示的に書く。

`shape` / `opacity` / `badge-*` / `font-*` は対象外とし、その旨を spec に書く（org tree 節の Note と同じ扱い）。

### 先に直す main のバグ

PoC で発見。`svg-renderer.ts` は hue を 2 箇所で読んでいる。フレームは `boundaryHue()`、縮退タブは `renderDegradedTabs()` が `palette.boundaryHues` を直接引いている。上書きを前者にだけ教えると、フレームは著者の色、タブは固定サイクルの色になり、1 つの boundary が 2 色に割れる（PoC のプレートで実際に Risk が紫の枠と緑のタブになった）。

今日 main で問題が出ていないのは上書きする手段が無く両者がたまたま一致しているだけなので、**セレクタを入れる前に読み口を 1 本に畳む**。TPL-2179 / TPL-219 の「定義は 1 つ、全 consumer がそれを読む」の系。

### 実装の指針

1. **hue 解決の 1 本化**（先行）。`boundaryHue()` を「boundary id から最終的な色を返す唯一の関数」にし、`renderDegradedTabs` もそれを通す。この時点では挙動不変で、退行テストのみ。
2. `StyleSelector.boundaryId` を足し、`parseSelector` に `edge#<id>` と同型の分岐、`computeSpecificity` に `+100` を追加。
3. `ResolvedStyles.boundaries` を `resolveStyles` で構築。カスケードは既存の specificity 順 + 同点なら後勝ち（`sourceIndex`）。
4. 1 の解決関数が `ResolvedStyles.boundaries` を見るようにし、未指定なら固定サイクルへフォールバック。`ResolvedStyles` を `renderFromLayout` まで通す（PoC のモジュールグローバルは spike 限定の手抜きなので持ち込まない）。
5. `SELECTOR_SPECIFICITY` に 2 行追加 + `pnpm gen:reference`。
6. spec: `style.md` / `style.ja.md` に Selector types 表の 2 行と「Boundary frame properties」節。節末尾に `> Related TPLs:` を付ける。`syntax.md` / `syntax.ja.md` の boundary 節から style 側へ 1 行リンク。
7. changeset: `@karasu-tools/core` + `karasu` の minor。experimental notation の範囲内なので言語版遷移は書かない（promotion gate は据え置き）。
8. AT: `docs/acceptance/2234-boundary-style-selector.md` を新規作成。目視項目:
   - 名指しした boundary が指定色で描かれ、名指ししていない boundary の色が変わらないこと
   - 枠線・薄い塗り・タイトル・縮退タブが同じ色であること（1 本化の目視確認）
   - `boundary { border-style: solid }` が全フレームに効くこと
9. proactive TPL: spec に新規節を足すので同 PR で 1 件起こす（`docs/process.md` の規約）。観点は「同一エンティティの見た目を複数の面が描くとき、色の決定は 1 つの関数に閉じる」。上記のバグがそのまま素材になる。
10. ADR 昇格: 実装完了後 `docs/adr/2234-boundary-style-selector.md` として昇格し、本 Design Doc は同 PR で削除する。legend を足さないという判断とその根拠（PoC のプレート）も ADR に含める。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 無し。`boundary` セレクタを書いていないシートは解決結果が変わらない。今日 `boundary { }` と書いていたモデルは無効果から有効に変わるが、これは TPL-1503 が求める方向の変化である。
- ドキュメント更新: `docs/spec/style.md` +ja、`docs/spec/syntax.md` +ja（相互リンク 1 行）。
- examples: `examples/en/feature-samples/` に style 付きサンプルを足すかは実装時に判断する。boundary のサンプルは既に 2 つあり、3 つ目を足すより既存の `boundary-clusters.krs` に `.krs.style` を添える方が素直かもしれない。

## 未解決の問い / 決めないこと

- **scoped boundary をどう指すか**。[ADR-2036](../adr/2036-scoped-boundary-declaration.md) で boundary の identity は（宣言スコープ, id）であり、同名の boundary が別スコープに存在しうる。`boundary#pci` は top-level の `pci` を指すのか、全スコープの `pci` を指すのか。実装時に、まず**全スコープの同 id にマッチする**（スコープ修飾を持たない = 修飾を問わない、という素直な読み）で入れ、スコープ限定が必要になったら修飾構文を後から足す方針を提案する。TPL-1352 の系なので、決めた解釈は spec に明記する。
- **team フレームの色指定**。要求はある（#2234 のレビューで挙がった）が、`team#Platform` の綴りに競合する読みがあるため follow-up にする。判断の根拠と、follow-up が再設計にならない理由は上記「team フレームを同じ回で扱わない理由」に書いた。本 Design Doc がマージされたら Issue を起票する。なお #2179 が team フレームを単色のままと決めたのは**固定サイクルの hue を配らない**という話であって、著者による上書きを禁じたものではない。team フレームは重ならない（1:1 の軸）ので、上書きを許しても多重包含の可読性の問題は発生しない。
- **legend の drift**。上述のとおり `swatch` 全般の性質として残す。
