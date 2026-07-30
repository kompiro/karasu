# facet 構文の実装設計 — 宣言ブロック・`facets` プロパティ・`facetIndex`・診断（Part B slice 1）

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2173](https://github.com/kompiro/karasu/issues/2173)（Part B slice 1）。親 [#2160](https://github.com/kompiro/karasu/issues/2160)（Part B）／ [#2065](https://github.com/kompiro/karasu/issues/2065)（program）
  - 上位 Design Doc: [`tags-and-facets.md`](tags-and-facets.md) — 語彙 register と facet の**形**（宣言 + プロパティ）を決めた設計。本 doc はその Part B を **どう実装するか**に限定する
  - 関連 ADR: [ADR-832](../adr/832-no-runtime-authz-modeling.md)（ルール言語を入れない — 本設計が守る fence）、[ADR-19](../adr/19-required-id-label-as-property.md)（id 必須 + `label` プロパティ）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（新 notation は experimental で着地）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze — 追加的構文のみ）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md) / [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（boundary slice A — 実装パターンの雛形）、[ADR-1386](../adr/1386-style-prescription-stance.md)（warning / info の register 判断）
  - 関連 TPL: 下記 [Related TPLs](#related-tpls)
  - コード: `packages/core/src/lexer/lexer.ts`、`packages/core/src/parser/parser.ts`、`packages/core/src/parser/reference-validation.ts`、`packages/core/src/resolver/warnings.ts`、`packages/core/src/fs/import-resolver.ts`、`packages/core/src/formatter/formatter.ts`、`packages/core/src/builtins/reference-data.ts`、`packages/i18n/src/{types,en,ja,render-warning,render-diagnostic}.ts`

## 背景・課題

[`tags-and-facets.md`](tags-and-facets.md) は「横断的関心事の受け皿として `facet` 構文を導入する」ところまでを決めた。形は確定している:

```krs
facet pii {
  label "個人情報"
  description "取扱いは ADR-1421 に従う"
  link "https://…/adr/1421.md" "ADR-1421"
}

entity Order {
  table OrderDB.orders
  facets pii
}
```

slice 1 は**描画より下**の一式（parser / AST / index / merge / fmt / 診断 / spec）を入れる。上位 doc が決めていない実装レベルの論点が 4 つ残っており、本 doc はそれを詰める:

1. `facet-not-declared`（未宣言 facet への参照）を **parser の Diagnostic** として出すか、**resolver の Warning kind** として出すか。両者は「マージ空間で評価されるか」「LSP の単一ドキュメント文脈でどう振る舞うか」「severity register を持つか」が異なる。
2. `facets` を**全 node kind で受理する**という決定（上位 doc (B1)）を、既存の双方向 drift ガード（`reference-parser-sync.test.ts` — 受理 ≡ カタログ広告）とどう整合させるか。
3. `facetIndex` を 1:N で持つ決定を、**multi-file merge 経路**まで一貫させる方法。
4. 新キーワード `facet` / `facets` を足すことの**語彙的な副作用**（既存モデルで同名の bare id / annotation を使っていた場合）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 宣言ブロックの雛形 | `parseBoundaryBlock`（`parser.ts:1907`）— `label` / `description` / `link` / `contains` を受理し、positional label は `positional-label-removed` で拒否 |
| 要素側リストの雛形 | `parseHandlesList`（`parser.ts:955`）— カンマ区切り id、失敗時 `expected-id-after` |
| node の本体パーサ | 3 箇所に分かれる: `parseBlockContentsWithProperties`（論理 kind）／ `parseInfraBlockContents`（database / queue / storage）／ `parseLeafNodeContents`（table / queue-item / bucket） |
| 参照存在検証 | `parser/reference-validation.ts` に純関数として置き、Parser（per-file）と ImportResolver（merged）が各自の空間で呼ぶ。ImportResolver は `MERGED_SPACE_REFERENCE_CODES` で per-file 版を抑止する |
| resolver warning | `resolver/warnings.ts` の `analyze(file, sheets)`。**呼ばれる時点で file は import マージ済み**（`compile.ts:297`） |
| LSP | parse diagnostics をそのまま出し、加えて `analyze(parseResult.value, [])` を**単一ドキュメント**で実行する。import 連動で偽陽性になる `unresolved-edge-endpoint` のみ抑止し、判断を TPL-20260612-01 に沿ってコメントで記録している |
| warning の severity | `types/warnings.ts` の `warningSeverity()` — `INFO_WARNING_KINDS` に載らない kind は `warning` |
| fmt の網羅ガード | `formatter-top-level-coverage.test.ts` が `KrsFile` の配列キーからフィクスチャ集合を導出（**top-level のみ**。per-node のネスト構文は守れない） |
| node kind × 共通フィールド | `base-node-fields-coverage.test.ts` が `keyof BaseNodeFields` を compile-time 契約で固定し、user-facing フィールド × 13 kind を runtime で総当たりする |
| kind × プロパティのカタログ | `builtins/reference-data.ts` の `nodeKinds[].properties`。`reference-parser-sync.test.ts` が **parser の受理と双方向一致**を検査し、`docs/spec/syntax.md` の表は `gen:reference` がここから生成する |
| LSP 補完 | `completion-keywords.ts` は lexer キーワードの**選別済み部分集合**。新キーワードは `KRS_KEYWORDS` か `EXCLUDED_FROM_COMPLETION` のどちらかに triage するまでテストが落ちる |

## 制約・前提

- **v1.0 freeze（ADR-1314）**: 追加は additive のみ。既存構文の解釈は変えない。`facet` は新 notation なので **experimental で着地**（ADR-1820）。
- **既定描画への影響ゼロ**: facet を書いても描画は変わらない。slice 1 では overlay / style セレクタ / 概観パネルはいずれも**入らない**。
- **ADR-832 の fence を守る**: facet 宣言の文法は `label` / `description` / `link` で閉じる。`contains` も述語も**入れない**（恒久的に）。
- **1:N が正常状態**: 多重所属は診断対象ではない。
- out of scope: overlay 描画（slice 2）、`.krs.style` の facet セレクタ（slice 3）、概観パネル・examples（slice 4）、edge への `facets`、明示的除外の tri-state（B5）、lifecycle facet（B7 — 却下済み）。

## 過去決定の確認

- `docs/adr/` を `facet` で grep → **0 件**。`status: not_adopted` の 5 本（ADR-7 / 45 / 104 / 105 / 284）はいずれも本テーマと無関係。
- 交差する唯一の決定は **ADR-832（ルール言語を入れない）**。上位 doc が「範囲の表現のみを specialize する `refines`」として整理済みで、slice 1 の文法は値言語を持たないため fence の内側に収まる。**衝突なし**。
- ADR-1974 が記録した boundary の 1:1 は「配置の制約であって所属の制約ではない」と上位 doc が再確認済み。facet は最初から 1:N で作る（[TPL-20260730-01](#related-tpls) がこの原則を今日 TPL 化した）。

## 検討した選択肢

### 論点 1: `facet-not-declared` の置き場

#### 案 1-A: parser の Diagnostic（`reference-validation.ts` に純関数、severity `warning`）

`contains-target-not-found` / `owns-target-not-found` と同じ形。ImportResolver が per-file 版を `MERGED_SPACE_REFERENCE_CODES` で抑止し、マージ後に再導出する。

**メリット**

- 「宣言ブロックへの参照が実在するか」という点で `contains` と**同型**。1 ファイル（`reference-validation.ts`）に facet の検証 2 種がまとまる。
- TPL-20260718-02 の既知の対処パターンをそのまま適用できる。

**デメリット**

- LSP は parse diagnostics を**無条件に**出すため、宣言が別ファイルにある正常な multi-file 構成でエディタに偽陽性が出る。parse diagnostics 側には抑止フックが無く、新設が要る。
- severity register（`warningSeverity`）を持たない。Issue #2173 が求める「severity-register entries」に対応物が無い。

#### 案 1-B: resolver の Warning kind（`warnings.ts` に detector、`warningSeverity` = warning）

`unresolved-handles` / `unresolved-realizes` / `invalid-owns` と同じ形。

**メリット**

- **`analyze()` は import マージ済みモデルに対して走る**ため、「宣言が A、参照が B」は構造的に正しく解決される（TPL-20260718-02 を機構で満たす）。
- [TPL-20260510-10](#related-tpls) が「新しい cross-reference プロパティには resolver-side 検証と unresolved warning を必ず付ける」と明示的に規定しており、`facets <id>` はまさにその cross-reference プロパティ。既存 detector（`handles` / `realizes`）が雛形になる。
- Part A（#2159）の `tag-not-builtin` / `annotation-not-builtin` と**同じ語彙衛生の家族**・同じ描画面（`render-warning`）に並ぶ。
- `warningSeverity` の register エントリを持つ（`INFO_WARNING_KINDS` に載せない = warning。事実 register の判断を TPL-20260514-08 に沿って明示できる）。
- LSP の単一ドキュメント文脈は**既存の判断済みフック**があり、抑止するか否かを TPL-20260612-01 の作法で記録できる。

**デメリット**

- facet の 2 診断が parser（`duplicate-facet-id`）と resolver（`facet-not-declared`）に分かれる。
- `analyze()` を呼ばない経路（もしあれば）では出ない。実際には app / CLI / LSP のすべてが呼ぶため実害はない。

#### LSP 単一ドキュメント文脈の扱い（案 1-B を採る場合の従属論点）

`analyze()` は LSP では**未解決の単一ドキュメント**に対して走る。宣言が別ファイルにある構成では `facet-not-declared` が偽陽性になりうる。

- **抑止する**: 偽陽性ゼロ。ただし **typo 検出がエディタで効かなくなる** — `facets pcl` に波線が出ないなら、この診断の主用途（宣言集合に対する完全な typo 検出）が最も効く場所で無効になる。
- **抑止しない**: 宣言と参照を別ファイルに分けた構成でのみ過剰報告。`invalid-owns` / `unresolved-handles` が既に同じ性質で抑止されておらず、抑止されているのは `unresolved-edge-endpoint` 1 件のみ。

### 論点 2: `facets` を kind カタログ（`reference-data.ts`）に載せるか

#### 案 2-A: 13 kind すべての `properties` に `facets` を追加する

`reference-parser-sync.test.ts` は「広告 ≡ 受理」を双方向で検査するため、載せないと落ちる。載せると `gen:reference` が `docs/spec/syntax.md`（+ja）の kind 表を再生成する。

**メリット**

- drift ガードを弱めずに済む。app の Reference パネルにも自動で出る。
- [TPL-20260727-01](#related-tpls)（parser が受理する形は spec に文書化されている）を満たす。

**デメリット**

- experimental な構文が、安定構文と同じ kind 表に並ぶ。表の列だけでは experimental だと読み取れない（facet 節の側で experimental と明示する必要がある）。

#### 案 2-B: テストに「experimental のため広告しない」除外を足す

**メリット**: 生成表が変わらない。
**デメリット**: 双方向 drift ガードに恒久的な穴を空ける。#2158 はまさにこの種の穴（カタログが parser から乖離）が原因だった。experimental はいずれ stable になるので、除外は「あとで消す」約束に依存する。

### 論点 3: `facetIndex` の 1:N を merge まで一貫させる

`boundaryIndex` の multi-file merge は `if (!merged.has(id))` の **first-wins** で書かれている。facet で同じ形を書くと、ファイル A で `facets pii`、ファイル B で同要素に `facets gdpr` と書いたとき 2 件目が消える。[TPL-20260730-01](#related-tpls) が「merge 経路すべてが同じ多値の意味論に従うこと」「`最初に見たものを保つ` が残っていないか grep する」と規定している。

→ **union merge 一択**（`Set` を kind ごとに合成）。選択肢として比較する余地はないが、boundary のコードを雛形にすると機械的に first-wins を書き写す危険があるため、論点として明記しておく。

### 論点 4: 新キーワードの語彙的副作用

`facet` / `facets` を lexer の KEYWORDS に足すと、それらを **bare id** に使っていた既存モデル（`service facets {}`）と、`@facet` アノテーションが壊れる。既存キーワード（`contains` / `owns` / `team` …）が同じ性質を持つのと同型で、逃げ道は quoted id（`service "facets" {}`）。

[TPL-20260511-01](#related-tpls) が求める「新キーワードは将来の実装側関心に引かれるか」の検査:  `facet` は faceted classification（多軸ラベリング）の含意で、authz / codegen の引力は弱い。引力があるのは「所属 → ルール」方向であり、そこは **ADR-832 が外部 fence** として既に塞いでいる。上位 doc が命名節でこの検討を済ませている（`concern` 却下の理由）。→ **語の選び直しは不要。spec の facet 節に ADR-832 へのリンクを 1 行埋める**（外部 fence パターン）。

## 比較

| 観点 | 案 1-A（parser Diagnostic） | 案 1-B（resolver Warning） |
| --- | --- | --- |
| マージ空間での評価 | 抑止 + 再導出の実装が要る | `analyze()` が既にマージ後（機構で満たす） |
| LSP 単一ドキュメント | 抑止フックが無く新設が要る | 既存の判断済みフックがある |
| severity register | 無し | `warningSeverity` に載る |
| TPL の指示 | TPL-20260718-02 の対処パターンに合う | **TPL-20260510-10 が明示的に要求する形** |
| 既存の同類 | `contains-target-not-found` | `unresolved-handles` / `unresolved-realizes` / `tag-not-builtin` |
| 診断の分散 | facet の 2 診断が 1 ファイルに集まる | parser と resolver に分かれる |

## Related TPLs

| TPL | 本設計での取り込み |
| --- | --- |
| [TPL-20260510-10](../test-perspectives/TPL-20260510-10-cross-reference-validation.md) — 新しい cross-reference プロパティには resolver-side 検証と unresolved warning を付ける | 論点 1 の決め手。`facets <id>` は cross-reference プロパティなので `facet-not-declared` を resolver warning として実装し、i18n en/ja と renderer switch を同 PR で更新する |
| [TPL-20260730-01](../test-perspectives/TPL-20260730-01-declared-membership-not-discarded-in-derived-index.md) — 宣言された多重所属を派生 index で捨てない | 論点 3。`facetIndex` は `Map<nodeId, Set<facetId>>`、merge は union。同一要素 N 件宣言 → 出力 N 件をテストで固定する |
| [TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md) — 参照存在チェックはマージ後の id 空間で | `facet-not-declared` はマージ後モデルで評価（`analyze()` の位置で機構的に成立）。`duplicate-facet-id` は per-file 抑止 + マージ後再導出で、宣言がファイルを跨いで重複する場合も捕まえる |
| [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理した語彙は効果を持つ | slice 1 の interim-inert 対策。`facetIndex` の消費者（`facet-not-declared` detector）を同 PR に置き、spec で「overlay は後続 slice」と明示する |
| [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — round-trip 保証 | 宣言ブロックは top-level 網羅ガードが自動で捕まえる。**per-node の `facets` プロパティは専用の round-trip テストを別に書く**（top-level 配列由来のガードはネスト構文に届かない） |
| [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) — 共通フィールド追加は AST / parser / renderer の三点同意 | `BaseNodeFields.facets` を追加すると `base-node-fields-coverage.test.ts` の compile-time 契約が落ちる。user-facing フィールドとして登録し、13 kind 総当たりの被験対象に含める |
| [TPL-20260727-01](../test-perspectives/TPL-20260727-01-parser-acceptance-documented-in-spec.md) — parser が受理する形は spec に文書化されている | 論点 2 で案 2-A を採る根拠。受理する全 kind の `facets` をカタログ経由で spec 表に出す |
| [TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md) — 全診断コードは規則カタログに 1 件の項目を持つ | `facet-not-declared` / `duplicate-facet-id` の行を `diagnostics.md`（+ja）に追加（meta テストが強制する） |
| [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — register は事実か流派判断かで決める | `facet-not-declared` は「宣言が存在しない」という**事実**で、流派判断ではない → `warning`（`INFO_WARNING_KINDS` に**載せない**） |
| [TPL-20260612-01](../test-perspectives/TPL-20260612-01-style-coupled-diagnostics-sheetless-context.md) — シート不在文脈（LSP 単一ドキュメント）での挙動を仕様化する | 論点 1 の従属論点。LSP で抑止する / しないをコードコメントに記録する |
| [TPL-20260511-01](../test-perspectives/TPL-20260511-01-keyword-lexical-ambiguity-fence-vs-deprecate.md) — 新キーワードの引力は外部 fence で縛れるか先に検討する | 論点 4。ADR-832 を外部 fence とし、spec の facet 節にリンクを 1 行埋める |
| [TPL-20260510-01](../test-perspectives/TPL-20260510-01-top-level-orphans.md) — top-level 宣言を全消費側で扱う | `facetIndex` の構築は system 配下だけでなく top-level の service / client / domain / infra とその子孫まで歩く |
| [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) — 検証の valid-target set は spec が許す全 kind を列挙する | `facets` は全 node kind で受理するので、index 構築の walk が 13 kind すべてに届くことをテストで固定する |

**proactive TPL の要否（3-Yes ルール）**: 本設計が違反しうる原則は上表の 13 件で網羅されており、いずれも既存 TPL が既に規定している。「既存 TPL に未掲載」が満たされないため**新規 TPL は起こさない**。代わりに `CLAUDE.md` の spec 改訂ルールに従い、新設する spec 節末尾に `> Related TPLs:` を置き、対応する TPL 側に `## 派生元 spec` の back-ref を同 PR で入れて双方向に紐付ける。

## 現時点の方針

**論点 1 は案 1-B（resolver Warning kind）、論点 2 は案 2-A（カタログに載せる）、論点 3 は union merge、論点 4 は外部 fence（語の選び直しはしない）を採る。**

論点 1 の決め手は TPL-20260510-10 で、`facets <id>` は「他ノード（ここでは top-level の facet 宣言）の id を指す参照プロパティ」そのものであり、TPL は resolver-side の検証 + unresolved warning を明示的に要求している。加えて `analyze()` がマージ後モデルに対して走るため、TPL-20260718-02 が求めるマージ空間評価を**追加の抑止機構なしで**満たす。LSP では**抑止しない** — 抑止すると宣言集合に対する完全な typo 検出という facet 最大の利点が、最も効くエディタ上で消える。過剰報告は「宣言と参照を別ファイルに分けた構成」に限られ、`invalid-owns` / `unresolved-handles` が既に同じ性質で運用されている。この判断は TPL-20260612-01 の作法どおりコードコメントに残す。

論点 2 は、experimental であることを理由に双方向 drift ガードへ穴を空ける費用の方が高い。experimental の表明は facet 節の見出しと注記が担い、kind 表は「parser が受理する事実」を述べる、と役割を分ける。

### 実装の指針

1. **lexer / AST** — `facet` / `facets` を KEYWORDS と `TokenType` に追加。`FacetBlock { kind: "facet"; id; label?; properties: CommonProperties; loc }`（`contains` なし・述語なし）、`BaseNodeFields.facets?: string[]`（空なら省略し既存ノードの形を変えない）、`KrsFile.facets: FacetBlock[]` と `KrsFile.facetIndex: Map<string, Set<string>>` を `createEmptyKrsFile()` に追加。診断 `"duplicate-facet-id": { facetId: string }`。
2. **parser** — `parseFacetBlock()`（`parseBoundaryBlock` の雛形。positional label は既存の `positional-label-removed` で拒否）を top-level 分岐に接続。`parseFacetsList()`（`parseHandlesList` の雛形。カンマ区切り・複数行はマージ・同一 id は冪等）を**本体パーサ 3 箇所すべて**に接続して 13 kind で受理する。node ブロック内の `facet` 宣言はブロックごと消費して `unexpected-token-in-block` を 1 件だけ出す（新しい診断コードは足さない。top-level 限定は spec に書く）。`buildFacetIndex()` は top-level orphan を含む全ノードを歩く。`duplicate-facet-id` は `reference-validation.ts` の純関数で判定する。
3. **merge（`import-resolver.ts`）** — `facets` 宣言を連結、`facetIndex` を **union** で合成（first-wins を書かない）。`duplicate-facet-id` を `MERGED_SPACE_REFERENCE_CODES` に加え、Pass 2 後に再導出する。
4. **resolver** — `detectFacetsNotDeclared(file)` を `analyze()` に追加。`facetIndex` を入力にする（index に slice 1 時点の消費者を与える）。`WarningKind` に `facet-not-declared` を追加し、`INFO_WARNING_KINDS` には載せない。
5. **formatter** — `renderFacetBlock()` + top-level dispatch、`renderProperties` に `facets` 行（1 本のカンマリストに正規化）。
6. **i18n** — `types` / `en` / `ja` / `render-diagnostic`（`duplicate-facet-id`）/ `render-warning`（`facet-not-declared`）。
7. **drift ガードの追随** — `reference-data.ts` の全 kind に `facets` を追加して `pnpm gen:reference`；`reference-parser-sync.test.ts` に `PROPERTY_SNIPPETS.facets` と `NOT_A_LOGICAL_NODE_PROPERTY` への `facet`；`base-node-fields-coverage.test.ts` の `ExpectedKeys` と `USER_FACING_FIELDS` に `facets`；LSP `completion-keywords.ts` は `facet` を補完に入れ `facets` を `EXCLUDED_FROM_COMPLETION` に triage。
8. **spec** — `docs/spec/syntax.md`（+ja）に experimental の facet 節（文法・全 kind・1:N・top-level 限定・診断表・**overlay / セレクタ / 概観は後続 slice で「今は描画に影響しない」**明記・ADR-832 リンク）。`tags-annotations.md`（+ja）の register 表を「導入予定」から実構文へ。`diagnostics.md`（+ja）に 2 行。節末尾の `> Related TPLs:` と TPL 側 `## 派生元 spec` の双方向リンク。
9. **changeset** — `@karasu-tools/core` + `karasu` を minor。
10. **AT** — `docs/acceptance/2173-facet-grammar.md`。slice 1 は描画面を持たないため**目視項目なし**（`N/A — all covered by automated tests`）。観点は:
    - 宣言ブロックが `label` / `description` / `link` を受理し、`contains` を拒否する
    - `facets` が 13 kind すべてで受理され、複数行・重複 id が冪等にマージされる
    - `facetIndex` が 1:N（2 facet 所属 → 要素 1 件に 2 件、診断なし）
    - 未宣言参照 → `facet-not-declared`（warning）／宣言済み → 無音
    - 宣言が別ファイル → 警告なし（マージ空間）／どこにも無い → 警告
    - 同一 id の宣言重複 → `duplicate-facet-id`（error）。ファイル横断でも 1 件だけ
    - fmt round-trip: 宣言ブロックと per-node `facets` の両方（+ idempotent）
    - en / ja の両メッセージ
11. **ADR 昇格** — 本 doc は単独では昇格させない。Part B 全 slice 完了後に上位 doc [`tags-and-facets.md`](tags-and-facets.md) と統合して `docs/adr/2065-tags-and-facets.md`（`refines: [ADR-832]`）へ昇格し、両 Design Doc を同 PR で削除する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 追加構文のみ。facet を書かないモデルの parse 結果・描画・診断はいずれも不変。唯一の非互換は **`facet` / `facets` を bare id / annotation 名に使っていた場合**で、quoted id（`service "facets" {}`）が逃げ道。既存 examples に該当は無い（`grep` で確認する）。
- **ドキュメント更新**: `docs/spec/syntax.md`+ja（新節 + 生成済み kind 表）、`docs/spec/tags-annotations.md`+ja、`docs/spec/diagnostics.md`+ja、TPL 12 本のうち back-ref を張る分。
- **テスト・examples への影響**: examples は変更しない（facet を使う feature-sample は slice 4）。既存テストで落ちるのは前掲の 4 つの drift ガードのみで、いずれも「新語彙の triage を人間に強制する」意図どおりの失敗。
