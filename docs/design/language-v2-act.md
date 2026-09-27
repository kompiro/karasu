# 言語 v2.0 の実施: tag / annotation 語彙の閉鎖と facet・boundary の core 昇格

- **日付**: 2026-09-27
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2677](https://github.com/kompiro/karasu/issues/2677)（閉鎖 + `facet` 昇格）、[#2678](https://github.com/kompiro/karasu/issues/2678)（`boundary` 昇格）
  - 関連 ADR: [ADR-2065](../adr/2065-tags-and-facets.md)（register 確定・v2.0 の到達点）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（promotion gate）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）、[ADR-2124](../adr/2124-version-vocabulary.md)（版語彙）、[ADR-2522](../adr/2522-vocabulary-census-drift.md)（corpus 証拠が来ない実測）、[ADR-2172](../adr/2172-builtin-vocabulary-expansion.md)（builtin 追加経路）、[ADR-2165](../adr/2165-logical-containment-rules.md)（containment 規則の error 化予約）、[ADR-837](../adr/837-client-capability-modeling.md)（client capability は open）、boundary の形 = [ADR-1974](../adr/1974-boundary-declaration-syntax.md) / [ADR-2036](../adr/2036-scoped-boundary-declaration.md) / [ADR-2161](../adr/2161-boundary-membership-1n.md) / [ADR-2234](../adr/2234-boundary-style-selector.md)、facet の形 = [ADR-2173](../adr/2173-facet-grammar-and-model.md) / [ADR-2174](../adr/2174-facet-overlay.md)
  - 関連 TPL: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理語彙の 3 状態）、[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)（builtin 追加の 3 問）、[TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md)（keystone 語の単一正典）、[TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md)（docs 取り込み時のアンカー解決）
  - コード: `packages/core/src/language-version.ts`、`packages/core/src/resolver/{warnings,style-resolver}.ts`、`packages/core/src/builtins/reference-data.ts`、`packages/core/src/renderer/svg-builder.ts`、`packages/i18n/src/{en,ja}.ts`

## 背景・課題

[ADR-2065](../adr/2065-tags-and-facets.md) は v2.0 の到達点を決めた（決定 3・4: `boundary` と `facet` を core に、tag / annotation をツール語彙に閉じる）が、**実施そのもの**は範囲外とし、「実施時には ADR-1314 との関係を新 ADR で明示する」と残した。v1.x で出せるスライスは両 Epic とも全消化済みで、残りは言語 major の 1 イベントだけである（roadmap §Syntax 2.0 プログラム）。

実施を止めていたのは [ADR-1820](../adr/1820-notation-promotion-gate.md) の既定「証拠が無ければ experimental 据え置き」だった。ところが facet の promotion trigger が求める証拠は来ないことが実測で確定している:

- (a) census の件数推移: 第三者の `.krs` は公開コードに実在しない（[ADR-2522](../adr/2522-vocabulary-census-drift.md) 決定 3）。母集団が無いので推移が出ない
- (b) builtin 追加要望・混乱 Issue: 2026-09-01 以降ゼロ
- (c) excludes tri-state の要望: ゼロ

証拠待ちを続けると v2.0 は永久に来ない。一方で v1.x の間に experimental として出す分は 0.7.0 リリース（2026-09-27）で出し終えた。オーナー判断として **boundary と facet を言語 v2.0 で採用する**（2026-09-27、#2677 の start-dev セッションで表明）。本 Design Doc はこの判断を gate に照らして正当化し、v2.0 の差分を確定する。

## 現状（インベントリ）

| 観点 | 現状 | v2.0 で触る箇所 |
| --- | --- | --- |
| 言語版 | `KRS_LANGUAGE_VERSION = "1.0"`（`packages/core/src/language-version.ts:16`）。`karasu --version` の 2 行目に出る | 定数を `"2.0"` に。`language-version.test.ts` の drift ガードが spec 4 文書（syntax / style × en / ja）の `.krs language v1.0` を stale として落とすので、冒頭の版表記と syntax.md:528-530 の前方参照を同時に書き換える。bundle 複製 `.claude/skills/reverse-architecture/reference/syntax.md` も byte 一致（`skill-reference-bundle-sync.ts`） |
| `tag-not-builtin` / `annotation-not-builtin` | warning。文言は「deprecated. Syntax v2.0 accepts tool vocabulary only」（en.ts:384-395 / ja.ts:381-392） | 「deprecated / 将来の v2.0」の未来形を外し、v2.0 の現行規則として言い直す。severity は warning のまま |
| `annotation-possible-typo` | info。stylesheet selector に出る名前では抑制。spec は「v2.0 で統合」と予告（tags-annotations.md:165） | 統合する（後述 決定 4） |
| 任意名 style セレクタ | `style-*-selector-not-builtin` は warning だが**ルールは照合され続ける**（`style-resolver.ts` の `nodeSelectorMatches` l.574-579 / `edgeSelectorMatches` l.624-630 / `orgNodeSelectorMatches` l.339-341 に builtin フィルタが無い） | 照合を止める。**隣接の照合点**も同じ規則にそろえる: legend `ref [tag]` の swatch 照合（`svg-builder.ts:527-533`）と `legend-ref-unresolved` の索引（`warnings.ts:115-145`） |
| experimental フラグ（コード） | `reference-data.ts:873`（boundary）/ `:886`（facet）/ `:1081,1084`（Syntax タブの節）が `experimental: true`。app の Reference パネルが badge を出す | フラグを false に。`reference-spec-sync.test.ts:228-246` が「spec 見出しの `experimental` 有無 == フラグ」を縛るので見出しと同時に動く |
| spec 見出し | syntax.md:1520 / 1710、syntax.ja.md:1420 / 1569、style.md:62、style.ja.md:62 に `— experimental` と直下の「Experimental notation (post-v1.0 watch)」blockquote | 接尾辞と blockquote を外す。アンカーが変わる |
| アンカー参照 | 6 種のアンカー（en 3 / ja 3）が docs/spec・docs/guide・ADR・TPL・roadmap・`.claude` bundle に計 40 箇所強 | 全箇所を新アンカーへ。docs-site の `check-links`（CI）が spec / guide の未解決を落とす。ADR・TPL・roadmap は CI 非検証なので grep で潰す |
| concepts | concepts.md:292-295「the tag system itself stays open」/ concepts.ja.md:311-314 | 閉鎖 ADR と同じ PR で改訂（ADR-2065 リスク台帳） |
| client `capability` | parser / AST が「open by design」、診断は duplicate のみ | 触らない（閉鎖原則の帰結） |
| docs-site | spec / guide / concepts は `packages/docs-site/scripts/lib/site-map.ts` の一覧から build 時に同期されるので、spec の改訂はそのまま載る。一方、手書き部分に boundary / facet の居場所が無い: examples gallery（`examples-manifest.ts`）は `facet-styling`（style 経由）と `tag-facet-registers` だけで、**boundary の feature-sample 3 本（`boundary-clusters` / `boundary-multi-membership` / `scoped-boundary`）は未掲載**。gallery の描画（`render-examples.ts`）は `compileProject` を view 種別と theme だけで呼ぶため、boundary 枠（`groupBy: "boundary"` 時のみ描画）も facet overlay（`selectedFacets`）も出ない。`compileProject` 自体は両オプションを受け付ける（`compile/compile.ts:202,208`）。home（`home/{en,ja}.md`）は 3 次元の説明のみ | 下記「docs-site への反映」 |
| census（2026-09-27 実測） | examples: 非 builtin tag 0 / annotation 0 / 非 builtin セレクタ 0、facet セレクタ 15。`--docs` 込み: 非 builtin tag 8・annotation 4、いずれも意図的な例示（style.md の移行 Before 例、AT 0064 / 0068、tags-annotations の警告例） | 閉鎖で新たに警告される shipped モデルは 0 件（前提条件 1 を満たす） |

## 制約・前提

- **語彙の閉鎖では既存ファイルを壊さない**: 非 builtin の tag / annotation は warning（ADR-2065 却下案「parse error にする」、TPL-1503 状態 (2)）。v2.0 で error にするのは、v1.x の間に warning として予告済みの規則違反（`node-not-in-context`）と、builtin 名の綴り誤り（`annotation-possible-typo`）の 2 つに限る
- **半分だけの v2.0 をリリースしない**: 言語版は 1 つの定数で表明する。昇格・閉鎖・版表記のどれかだけが main に載った状態でリリースが切られると、CHANGELOG と挙動が食い違う
- **パッケージ版は言語版と独立**（ADR-2124）。本 Design Doc は言語軸だけを扱う。パッケージどうしも独立に版を上げる（ADR-1315 / ADR-1758。同じ版で揃える案は [#2936](https://github.com/kompiro/karasu/issues/2936) で検討して取り下げ）。v2.0 のリリースで各パッケージに付ける版（1.0.0 にするか等）は本件の外で決める
- **範囲外**: 新しい builtin 語彙の追加（ADR-2172 の経路で個別に扱う）、excludes tri-state（ADR-2065「決めないこと」を維持）、boundary / facet の構文変更（昇格は現行の形をそのまま約束する）

## 言語 v2.0 に取り込む項目（登録簿）

repo 内で「言語 v2.0 で行う」と登録・予告されている項目を、spec・ADR・roadmap・コードコメントから洗い出した（`grep -E "v2\.0|言語 v2|Syntax 2\.0|構文 2\.0"`、2026-09-27）。

**取り込むもの**

| # | 項目 | 登録元 | v2.0 での扱い |
| --- | --- | --- | --- |
| 1 | `facet` の core 昇格 | ADR-2065 決定 3、#2677 | experimental 表示を外し互換を約束する |
| 2 | `boundary` の core 昇格 | ADR-2065 決定 3、#2678 | 同上 |
| 3 | tag / annotation 語彙の閉鎖 | ADR-2065 決定 4、roadmap §語彙の閉鎖 | 非 builtin は受理・効果なし・**warning** |
| 4 | 任意名 tag / annotation style セレクタの無効化 | ADR-2065 決定 5、#2175、style.md §Migrating | 当該ルールは何にも一致しない（warning） |
| 5 | `node-not-in-context` の **error 化** | ADR-2165、roadmap §追跡、syntax.md §Nesting placement | error（受理しない構文。下記 error の定義） |
| 6 | `annotation-possible-typo` の扱い | tags-annotations.md「v2.0 で統合」、`types/warnings.ts:314` | 統合ではなく **error 化**（オーナー判断 2026-09-27） |
| 7 | error の定義の明文化 | 本 Design Doc で新設 | 下記 論点 4 |
| 8 | concepts.md の「tag system は open」の supersede | ADR-2065 リスク台帳、roadmap 閉鎖の前提条件 2 | 閉鎖 ADR と同じ PR で改訂 |
| 9 | 言語版の表明 | ADR-2124 | `KRS_LANGUAGE_VERSION = "2.0"`、changeset / CHANGELOG に版遷移を明記 |
| 10 | 支援項目（v2.0 の前提を満たすための修正） | 本 Design Doc のレビューで発見 | `delivers` を `SYSTEM_ASSIGNED_TAGS` へ（決定 5）、VS Code preview の error 時描画を他 surface に揃える（論点 4）、openapi translator の出力を containment 規則に合わせる（決定 8） |

**v2.0 と結びつけて言及されているが取り込まないもの**

| 項目 | 言及元 | 取り込まない理由 |
| --- | --- | --- |
| パッケージ版（CLI 1.0.0 にするか等） | ADR-2124（「言語 v2.0 実施時の判断に委ねる」） | 言語版とパッケージ版は独立（ADR-2124）で、本件の成否に影響しない。パッケージごとの 1.0.0 は各表面（CLI のコマンド・フラグ・出力、core の TS API、vscode のコマンド・設定）の棚卸しを前提に別途判断する |
| `system` 直下の `domain` の error 化 | ADR-2184 備考（「決めない」） | `canContain` に載る正当な配置（ADR-2165）。v2.0 の規則違反ではない |
| エッジの位置引数ラベル `A -> B "calls"` の撤去 | ADR-2209 却下案 | ADR-2209 が shorthand を正式形として残すと決定済み |
| エッジ配置規則の狭め（service-anchored の診断化、`client` 等への起点スコープ規則の拡張） | ADR-2223 / ADR-2501 却下案 | どちらも「v2.0 を要するので採らない」として却下された案で、登録ではない |
| 明示的除外（excludes tri-state） | ADR-2065 決めないこと | 要求が観測されていない |
| tag の綴り誤り検出 | （登録なし） | annotation と違い near-miss 検出の実装自体が無い。必要なら別途 |

## 検討した選択肢

### 論点 1: 証拠なしで gate を通してよいか

#### 案 1A: オーナー判断で gate を通す（トリガー (i) で発火）

ADR-1820 のトリガー (i)「その notation に触れるリリースの直前」で gate を開き、判断材料として「昇格先は ADR-2065 で確定済み」「corpus 証拠は構造的に来ない（ADR-2522）」「v1.x での実用面（自前モデル・examples・feature-sample）で形が崩れていない」を置く。ADR-1820 の既定を**否定しない**: 既定が守ろうとしたのは「昇格先も形も未定のものを硬直化させる」ことで、本件は昇格先が 2 か月前に決定済みであり、残る不確実性は形の妥当性だけである。

**メリット**: v2.0 が実施可能になる。ADR-1820 の枠内（トリガー (i)）で説明がつく
**デメリット**: 形の誤りを v2.0 以降は major でしか直せない。第三者の利用で pain が出たら次の major まで持ち越す

#### 案 1B: 証拠が来るまで据え置く

**メリット**: ADR-1820 の既定どおり
**デメリット**: 証拠源が実在しないので終わりが無い。ADR-2065 の決定 3・4 が恒久的に未実施になり、v1.x の deprecation 警告（「v2.0 では…」）が約束を果たさないまま残る

### 論点 2: `node-not-in-context` と `annotation-possible-typo` を error にするか

**オーナー判断（2026-09-27）で両方を v2.0 で error にする。** 以下は判断の前提と帰結の整理。

- **warn-don't-error との関係**: roadmap §syntax v1.0 の定義は「未完成・in-flight なモデルでも render できることが差別化要因」と書く。一方 ADR-2208 / ADR-2501 は、warn-don't-error が *未解決参照*（spec §S6）の扱いを述べたものであって、構文の受理形を warning に留める約束ではないと読みを確定している。containment 規則の違反と builtin 名の綴り誤りはどちらも未解決参照ではなく構文の受理形の問題なので、error 化はこの読みと矛盾しない。v2.0 で roadmap の記述を §S6 の範囲に限定して書き直す（決定 6）
- **`node-not-in-context`**: v1.x で warning として予告済み（ADR-2165）。移行は「v2.0 に上げる前に warning を 0 にする」で閉じる
  - shipped examples は 0 件（`examples.test.ts:329-356` が既に fence）
  - docs の ```krs フェンスに 8 件（`docs/guide/02-onboarding(.ja).md:76`、AT 0053 / 0057、ADR-643 など、ほぼ全て `service { usecase }`）。`lint:krs-fences` は error で落ちるので、v2.0 で書き直しを強制できる
  - **`karasu translate --from openapi` が `service X { usecase … }` を出力する**（`translate/openapi.ts:106,192`）。放置すると translate の出力が描画されなくなるので、同じ PR で domain を挟む出力に直す
- **`annotation-possible-typo`**: builtin 名の綴り誤り（`@depracated`）は、書いた人が builtin の効果を意図したのに黙って効かない状態で、閉鎖後の非 builtin 名（効果が無いことを知って書く未知の語彙）とは性質が違う。前者は error、後者は warning という非対称を明示的に採る
  - 近さの判定が**言語の定義になる**。現行の `closestBuiltinAnnotation`（Levenshtein に隣接転置を加えた距離、builtin 名が 4 文字以下なら 1、それ以上なら 2、最も近いものを採る）を spec に固定する
  - 現行の抑制条件（stylesheet の annotation セレクタに出る名前では出さない）は、任意名セレクタが無効化されるので撤去する。LSP だけ抑制が効かない現状の不整合もこれで消える
  - 帰結として、`new` に近い短い名前（`@news` `@now` `@few`）も error になり図が更新されなくなる。メッセージに候補（`did you mean @new?`）を必ず含めることで受け入れる
  - 現行は resolver の `Warning` 経路（severity を持たず error を表せない）で出ているので、parser の `Diagnostic` 経路に移す。`annotation-not-builtin` とは排他（error が立つ名前には warning を重ねない）

### 論点 3: 実装の割り方

#### 案 3A: 1 本の実装 PR

版定数・昇格・閉鎖・docs・ADR をまとめて 1 PR にする。差分は大きいが大半は docs とアンカーの機械的な書き換えで、コードの挙動変更は style 照合の数箇所と診断文言に限られる。

#### 案 3B: スライス PR を main に順次マージ

**デメリット**: 途中状態の main からリリースが切られうる（リリースは workflow dispatch、月次トレイン #2922 も検討中）。「言語 v2.0 を名乗るが selector は照合される」等の食い違いが公開されうる

#### 案 3C: stacked PR を最下層から順にレビューし、一括でマージ

**メリット**: レビュー単位を小さくできる
**デメリット**: 運用コストに見合うほどコード差分が大きくない

なお「途中状態を出さない」制約が掛かるのは npm リリースに載るパッケージ（core / cli / lsp / vscode と、それらが同梱する spec 参照）だけである。docs-site の手書き部分（gallery・home）はリリースと無関係に main から配備されるので、別 PR に切り出しても食い違いは公開されない。

### 論点 4: error の定義

オーナー提案: **error = karasu が受け入れない構文。描画しない。**

現状を調べると、これは既存挙動をほぼそのまま言葉にしたものである。

- spec の定義は「`error` — the model is malformed; the offending construct is rejected」（`docs/spec/diagnostics.md:35`）
- error が 1 件でも立っていると、app は直前の有効な SVG を出し直し、`karasu render` / `subtree` は exit 1 で何も書かず、`serve` の描画 endpoint・share 描画・nest は 422、docs-site の build は失敗する（ADR-2208 が記録した挙動）
- 拒否された construct はどのビューにも描かない（ADR-2501）
- **例外が 1 つ**: VS Code の preview（`packages/vscode/src/preview-panel.ts:210-238`）は severity を見ずに部分的な model の SVG を表示する

#### 案 4A: 図全体を描かない（既存 surface の挙動を定義に格上げ）

言語の定義を 2 層で書く。

1. **model**: error の construct は受理されず model に入らない。除く単位は「その規則が拒否する construct ちょうど」で、`node-not-in-context` はそのノードと subtree、`annotation-possible-typo` はその annotation 1 つ
2. **surface**: error が 1 件でも立っている間、描画する surface は新しい図を出さない。VS Code preview もこれに揃える

**メリット**: 既存挙動の明文化なので surface の改修は VS Code preview だけ。「error を直さないと図が変わらない」が全 surface で一貫する
**デメリット**: typo 1 つで図全体が更新されなくなる

#### 案 4B: error の construct だけ除き、残りは描く（部分描画）

**デメリット**: error があるのに一見正常な図が出る。さらに parser の回復が一様でない（`infra-not-in-context` はキーワードしか消費せず後続が崩れ、後ろの `domain` が top level に浮く）ので、部分描画は著者が書いていない構造を描きうる。全 surface の挙動を変える改修になる

**案 4A を採る。** 付随して、既存 error のうち「除く単位が construct ちょうど」を満たさないもの（`infra-not-in-context` / `property-not-for-node-kind` がキーワードだけ消費して後続に波及する）は定義に照らして欠陥になる。v2.0 で新設する 2 つは定義どおりに実装し、既存の波及は別 Issue で扱う。

## 現時点の方針

**案 1A・論点 2（両方 error 化）・案 3A・案 4A を採用する。**

gate はオーナー判断でトリガー (i) により通す。ADR-1820 の既定は「昇格先も形も観察中のもの」に向けた規律で、昇格先が ADR-2065 で決まり、証拠源が存在しないことが ADR-2522 で実測された notation には、据え置きが守るものが残っていない。containment 規則違反と builtin 名の綴り誤りは構文の受理形の問題で、warn-don't-error（未解決参照の方針）の対象外なので error にし、error は「受理しない構文、描画しない」と定義する。実装は途中状態をリリースに露出させないため 1 PR にまとめ、リリースと無関係に配備される docs-site の手書き部分（gallery・home）だけを後続の別 PR にする。

### 決定事項（ADR-2677 に昇格させる内容）

1. **言語 v2.0 を実施する**。`KRS_LANGUAGE_VERSION = "2.0"`。リリースの changeset / CHANGELOG に `.krs language v1.0 → v2.0` を明記する（ADR-2124）。
2. **`facet` と `boundary` を core（stable）へ昇格する**。約束する形は現行 spec の記述そのもの（facet = ADR-2173 / 2174 + edge facets #2544、boundary = ADR-1974 / 2036 / 2161 / 2234）。昇格の判断根拠は上記論点 1 を ADR に記録し、ADR-1820 のトリガー (i) による発火として位置づける。
3. **tag / annotation をツール語彙に閉じる**。受理はするが効果を持たず警告される（TPL-1503 状態 (2)）。parse error にはしない。
   - `tag-not-builtin` / `annotation-not-builtin`: severity は warning のまま。文言から「deprecated」「Syntax v2.0 accepts…」の予告形を外し、現行規則として言い直す（例: `"[${tag}]" on ${nodeId} is not in the tool vocabulary and has no effect.`）。migration note は維持。
4. **`annotation-possible-typo` を error にする**。builtin annotation 名との距離が予算内（builtin 名 4 文字以下は 1、それ以上は 2。距離は隣接転置込みの Levenshtein）の非 builtin 名は受理せず、その annotation を model から除く。メッセージに最も近い builtin 名を含める。stylesheet セレクタによる抑制は撤去。`annotation-not-builtin` とは排他。parser の `Diagnostic` 経路で出す。
5. **任意名の tag / annotation style セレクタを無効化する**。
   - 意味論: セレクタが**非 builtin の tag / annotation 項を 1 つでも含めば、そのルール全体が何にも一致しない**。項だけを無視するとルールが広く当たりすぎる（`service[pci]` が全 service に当たる）ので採らない。
   - 対象の照合点: `nodeSelectorMatches` / `edgeSelectorMatches` / `orgNodeSelectorMatches`（team の annotation badge を含む）/ legend `ref [tag]` / `ref @annotation` の swatch 照合 / `legend-ref-unresolved` の索引。builtin 集合は `REFERENCE_DATA` + `SYSTEM_ASSIGNED_TAGS`（`detect*NotBuiltin` と同じ集合を共有する）。
   - system sheet（builtin theme・注入 sheet）は対象外のまま。ただし style resolver はルールの出自（どの sheet か）を知らず、system sheet の境界を知っているのは `analyze()` だけなので、照合点での判定は**全 sheet に一律に掛かる**。したがって system sheet が狙うタグは全て builtin 集合に入っていなければならない。現状 1 つ漏れている: **`delivers`**（`view-extract.ts:332` が `delivers` プロパティから導出した client 向け edge に自動付与し、`default-style.ts:351,633` の `edge[delivers]` が紫の破線で描く）は `REFERENCE_DATA.tags` にも `SYSTEM_ASSIGNED_TAGS` にも無い。放置すると v2.0 で全ての `delivers` edge が黙ってスタイルを失い、legend `ref [delivers]` も unresolved になる。対処として `delivers` を `SYSTEM_ASSIGNED_TAGS` に加える（resolver に sheet 境界を渡す案は、境界の情報を照合経路全体に通す改修になり、判定が sheet ごとに割れるので採らない）。これは v1.x の潜在バグでもある: 今日ユーザー sheet に `edge[delivers]` を書くと `style-tag-selector-not-builtin` が誤発火する。
   - 再発防止として drift テストを置く: **コードが自動付与するタグ（`view-extract.ts` 等の `tags: [...]` リテラル、`edgeSelectorMatches` が足す `async` / `sync` / `cyclic`）と、builtin theme（`default-style.ts`）のセレクタが参照する tag / annotation が、全て builtin 集合に含まれる**こと。
   - `style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin`: severity は warning のまま、文言を「deprecated, still applies」から「**このルールは適用されない**」に変える（TPL-1503: 受理して効果ゼロのものは警告されねばならない）。migration note（facet 3 ステップ）は維持。
6. **`docs/concepts.md` / `.ja.md` を同じ PR で改訂する**（決定 11 の warn-don't-error の範囲も含む）。「the tag system itself stays open」を、閉鎖原則（ツールが所有する語彙は閉じ、世界が所有する語彙 = client `capability` は open）に置き換える。
7. **ADR-1314 との関係**: ADR-1314 は supersede しない。ADR-1314 が定義した言語版セマンティクス（追加は v1.x、破壊は v2.0）を**そのまま行使する**最初の major であり、v1.0 の凍結スコープのうち v2.0 で終了・変更するのは「open tag set / open annotation set」「任意名セレクタの照合」と、診断 register の 2 点の格上げ（`node-not-in-context` warning → error、`annotation-possible-typo` info → error）である、と ADR-2677 に列挙する（ADR-1314 本文は immutable なので、関係は新 ADR 側に書く）。
8. **`node-not-in-context` を error にする**（ADR-2165 の予約を実施）。そのノードと subtree を model から除く。除いたノードを指す参照は従来どおり §S6 の warning（`unresolved-edge-endpoint` 等）になる。`karasu translate --from openapi` の出力を domain を挟む形に直す。
9. **パッケージ版は本 ADR で決めない**。ADR-2124 が言語 v2.0 に委ねたパッケージ版（CLI 1.0.0 など）の判断は、パッケージごとに表面の棚卸しを前提として別途行う。パッケージどうしは独立に版を上げる（ADR-1315 / ADR-1758）。
10. **error の定義**（案 4A）: error = karasu が受理しない構文。error の construct は model に入らず、error が 1 件でも立っている間はどの surface も新しい図を出さない。`docs/spec/diagnostics.md` の severity 定義節に書き、VS Code preview を揃える。
11. **warn-don't-error の範囲の明確化**: roadmap §syntax v1.0 の定義 補足と `docs/concepts.md` の該当記述を、§S6（未解決参照）の方針として書き直す（ADR-2208 / ADR-2501 の読みを keystone 文書に反映）。

### 実装の指針（1 PR、`Closes #2677` / `Closes #2678`）

1. **core**
   - `language-version.ts`: `"2.0"`
   - `style-resolver.ts`: builtin 判定ヘルパを 1 つ置き（`warnings.ts` の集合と共有）、3 つの照合関数の冒頭で「非 builtin 項を含むセレクタ → false」
   - `svg-builder.ts` の `ruleMatchesTarget`、`warnings.ts` の `indexStyleSelectors` を同じヘルパで絞る
   - `annotation-possible-typo`: resolver（`warnings.ts:239-283`）から parser の `Diagnostic`（severity error）へ移し、annotation を AST に入れない。`annotation-not-builtin` との排他。型コメントの「v1.x / v2.0」予告を現行形に
   - `parser.ts:870-885`: `node-not-in-context` を severity error にし、`children.push(child)` をやめる
   - `translate/openapi.ts`: usecase を domain で包んで出力
   - `reference-data.ts`: boundary / facet と Syntax タブ 2 節の `experimental` を false
2. **i18n**: 4 診断の en / ja 文言、`render-warning.ts`
3. **vscode**: `preview-panel.ts` に error 時のゲートを入れ、他 surface と同じく新しい図を出さない（直前の有効な SVG を保つ）
4. **app**: Reference パネルの experimental badge は機構として残す（将来の experimental notation 用）。`ReferenceContent.test.tsx` の「badge が 1 つ以上」を fixture ベースに書き換える
5. **docs**
   - spec 4 文書の冒頭の版表記（`frozen` の語と ADR-1314 参照を v2.0 の表現へ）
   - syntax / style の見出しから `— experimental` と blockquote を除去し、全アンカー参照を更新（grep で 0 件を確認）
   - tags-annotations(.ja) の「deprecated (v1.x)」2 節を v2.0 規則に書き換え、typo hint の統合を反映
   - style(.ja) の「Migrating an arbitrary-name… selector」節を「v2.0 では照合されない」に
   - diagnostics(.ja): severity 定義節に error の定義（決定 10）、4 診断の行、`annotation-possible-typo` / `node-not-in-context` を error 行へ
   - syntax(.ja) §Nesting placement（l.528-532 の「v2.0 で error」予告を現行規則に）、tags-annotations(.ja) の typo hint 節（距離規則を明記）
   - docs の ```krs フェンス 8 件の `node-not-in-context` を解消（`lint:krs-fences` が error で落とす）
   - concepts(.ja)、roadmap（watch 登録から 2 行を外す、§Syntax 2.0 を実施済みに pruning、`version vocabulary` の現在版）、glossary の版表記
   - `.claude/skills/reverse-architecture/reference/` の bundle を同期
6. **examples**: `builtins/examples.ts` の「still works in v1.x, but it now warns」系と experimental 言及（l.2141 他）を `update-examples` スキルで examples/ と同時に更新
7. **テスト**
   - `facet-style-selector.test.ts:323`「still applies the deprecated rule」を「applies no longer」に反転。l.199 の cascade 同点テストは builtin tag で書き直す
   - 新規: 非 builtin 項を含む複合セレクタ（`service[pci]`）がどのノードにも当たらない / legend ref が unresolved になる / team annotation badge が付かない / system sheet の builtin セレクタは影響なし（とくに `delivers` edge が builtin theme のスタイルを保つこと）/ 上記の自動付与タグ・builtin theme セレクタの drift テスト
   - `reference-top-level-coverage.test.ts:108` の期待値を `[]` に
   - `warnings.test.ts` の typo hint 系を parser 側 error のテストへ移す（距離規則の境界: `@new` 系 1、5 文字以上 2、抑制が無いこと、`annotation-not-builtin` と排他）
   - `node-not-in-context`: error になりノードと subtree が model に無いこと、除いたノードへの edge が §S6 の warning になること、error 以外の波及が無いこと
   - openapi translate の出力が error ゼロで描画されること
   - VS Code preview: error がある source で新しい図を出さないこと
8. **AT**: `docs/acceptance/` に新規 1 件。人間確認が要るのは次のみ:
   - app で任意名 tag セレクタを書いたモデルを開き、スタイルが当たらず警告が出ること、facet セレクタへ書き換えると同じ見た目に戻ること
   - Reference パネルで boundary / facet の experimental badge が消えていること
   - `karasu --version` が `.krs language v2.0` を出すこと
   - app と VS Code preview で、`service { usecase }` や `@depracated` を書くと error が出て図が更新されず、直すと描画が戻ること
9. **changeset**: core / cli / vscode の 3 つを名指しし（ADR-1758 のとおり core の変更は core と CLI の両方を名指しする）、`.krs language v1.0 → v2.0` を明記する。bump レベルはパッケージごとに semver 規約で決める（パッケージ版の判断が別途出ればそれに従う）
10. **ADR 昇格**: 実装 PR と下記 docs-site PR のマージ後、本 Design Doc を ADR-2677 に昇格して削除する

### docs-site への反映（別 PR、追跡 = [#2937](https://github.com/kompiro/karasu/issues/2937)）

v2.0 で boundary と facet が「唯一のユーザー拡張点 + view 内グルーピング」という語彙体系の主軸になるので、docs-site でも spec の奥ではなく入口から見えるようにする。変更は次の 3 つで構成する（追跡は実装 PR が #2677 を閉じた後も残るよう独立 Issue [#2937](https://github.com/kompiro/karasu/issues/2937) に持つ）:

1. **gallery で boundary 枠と facet overlay が実際に描かれている**
   - `GalleryDiagram` に描画オプション `render?: { groupBy?: "team" | "boundary"; selectedFacets?: readonly string[] }` を足し、`render-examples.ts` が `compileProject` に渡す（system view のみ。deploy / org には渡さない）
   - 新しい gallery ページ **Grouping & membership**（`slug: "grouping-and-membership"`、group は `feature-samples`）を立て、次を載せる:
     - `boundary-clusters`（`groupBy: "boundary"`）: 意味的クラスタの枠
     - `boundary-multi-membership`（`groupBy: "boundary"`）: 多重所属の banded 描画
     - `scoped-boundary`（`groupBy: "boundary"`）: スコープ宣言
     - `tag-facet-registers`（`selectedFacets` に宣言済み facet を 1 つ）: facet overlay のハイライト。既存の feature-samples ページからはこちらへ移す
   - caption / blurb に experimental の語を入れない。各ダイアグラムの下に「app で Group by: Boundary / facet overlay を切り替えると同じ図になる」旨と spec 節へのリンクを置く
   - 既存 `facet-styling`（テーマ別シナリオ）はそのまま（style 経由の facet 活用例として役割が別）
2. **home（`home/en.md` / `ja.md`）の「What is karasu?」に語彙の 4 register を 1 行で示す**: 「tag = 何であるか / annotation = いまどの段階か（どちらもツールの語彙）/ facet = どの集合に属するか（ユーザーが宣言）/ boundary = どう束ねて見るか」。リンク先は tags-annotations の *Vocabulary registers* 節と新 gallery ページ
3. **同期される spec / guide のアンカーが全て解決する**: 実装 PR 側の見出し変更で担保し、`pnpm --filter @karasu-tools/docs-site run check-links` が通ることを確認する

順序と独立性:

- gallery の描画オプション追加自体は言語版に依存しないが、caption と home の文言は「core」前提なので **実装 PR のマージ後に出す**。docs-site は main への push で即配備される（`.github/workflows/pages.yml`）ため、先に出すと v1.x の spec と「core」の文言が並ぶ
- 実装 PR も spec の改訂を通じて docs-site に即配備される。npm リリースより先に spec が「言語 v2.0」を名乗る期間が生じるので、実装 PR は **リリース直前にマージする**（リリースの流れ上、マージ → release PR が最短）
- `examples-coverage.test.ts` の不変条件（`examples/` ↔ manifest）に新ページの `githubDir` が合うこと、`gallery-pages.test.ts` / `render-examples.test.ts` に描画オプションのケース（boundary 枠の `<g>` / overlay の class が SVG に出る）を足すことを PR の完了条件にする
- AT（人間確認）: docs-site preview の Grouping & membership ページで boundary 枠と facet ハイライトが見えること、home の 4 register の行からリンクが辿れること

### 影響範囲・マイグレーション

- **error になるモデル**: `node-not-in-context`（v1.x で warning 済み）か builtin annotation 名の綴り誤りを含むモデルは、v2.0 で図が描かれなくなる。移行は「上げる前に v1.x でこの 2 つの warning / info を 0 にする」。`karasu fmt` は error のある source を拒否するので、手で直してから上げる
- **既存ユーザー（上記以外）**: 非 builtin の tag / annotation を書いたモデルは従来どおり parse・描画され、警告の文言が変わるだけ。**見た目が変わるのは任意名セレクタでスタイルを当てていたモデルだけ**で、v1.x から出ている `style-*-selector-not-builtin` 警告がそのまま移行対象を指す。移行は facet 宣言 + `facets` 付与 + `[facets=<id>]` への書き換え（specificity 同点なので 1 ルールずつ置き換えられる）
- **版スキュー**: v2.0 は構文を足していないので、どちらの版でも parse 結果と診断以外の model は同じになる。描画が割れるのは**任意名 tag / annotation セレクタを含む stylesheet** だけで、v1.x のツールはそのルールを適用し、v2.0 のツールは適用せず警告する（例: `service[pci] { color: red }` は v1.x で赤、v2.0 で既定色）。facet セレクタへ移行済みの stylesheet は両版で同じ見た目になるので、混在期間の推奨は「移行してから v2.0 に上げる」
- **生成パイプライン**（reverse / translate / LLM）: 自由語彙を出すと警告される。ADR-2065 リスク台帳どおり hallucinated 語彙の検出器として運用
- **shipped examples**: census で非 builtin 0 件なので挙動変化なし（文言の更新のみ）

## 未解決の問い / 決めないこと

- **レビューで確認したい点**: 論点 4 で案 4A（図全体を描かない）を採ること、`annotation-possible-typo` の距離規則をそのまま言語の定義に固定すること（`@news` 等も error になる）。診断コード名は継続性のため `annotation-possible-typo` のまま残す（error に "possible" が付く違和感は許容）
- 既存 error の波及（`infra-not-in-context` 等が construct ちょうどを除かない）の修正は別 Issue
- excludes tri-state、lifecycle 系 facet の不許可、ルール言語の不導入は ADR-2065 のまま動かさない
- 閉鎖後に届く builtin 追加要望は ADR-2172 / TPL-2172 の経路で個別に扱う
- パッケージ版（CLI 1.0.0 など。パッケージごとに別途判断）
