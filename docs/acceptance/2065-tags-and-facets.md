# AT: tags-and-facets プログラム — 語彙 register の確定（Part A + Part B 統合）

- **日付**: 2026-08-04
- **関連 Issue**: [#2065](https://github.com/kompiro/karasu/issues/2065)（program）。Part A [#2159](https://github.com/kompiro/karasu/issues/2159)、Part B [#2160](https://github.com/kompiro/karasu/issues/2160)（slice [#2173](https://github.com/kompiro/karasu/issues/2173) / [#2174](https://github.com/kompiro/karasu/issues/2174) / [#2175](https://github.com/kompiro/karasu/issues/2175) / [#2177](https://github.com/kompiro/karasu/issues/2177)）
- **関連 ADR**: **新規** [ADR-2065](../adr/2065-tags-and-facets.md)（`refines: [ADR-832]`）、[ADR-2173](../adr/2173-facet-grammar-and-model.md)、[ADR-2174](../adr/2174-facet-overlay.md)
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Cross-cutting membership / [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) §Vocabulary registers / [`docs/spec/style.md`](../spec/style.md) §Facet selectors（すべて +ja）
- **関連 TPL**: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)、[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)、[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)

> **この AT はスライス AT の上位にあり、置き換えではない。** 各スライスの詳細な受け入れ条件は
> [2159](2159-tag-annotation-deprecation.md) / [2173](2173-facet-grammar.md) /
> [2174](2174-facet-overlay.md) / [2175](2175-facet-style-selectors.md) /
> [2177](2177-facet-overview.md) が持つ。ここが持つのは **プログラム全体としての主張** —
> スライスを 1 本ずつ見ても確かめられないもの — と、design doc のチェックリストのうち
> 個別スライスが引き取らなかった項目である。

## 受け入れ条件

### 語彙 register が 4 つに分かれていること

- [x] AT-A: 4 つの register が spec に明記され、それぞれ**別の質問**に答えている（tag = 何であるか / annotation = lifecycle / facet = 外在的集合への所属 / boundary = view のグルーピング）

  > ✅ Automated — `packages/core/src/builtins/reference-spec-sync.test.ts` が `docs/spec/` の該当節の存在をカタログと突き合わせる。四分法の記述そのものは spec の散文なので、AT-M の目視で確認する

- [x] AT-B: 同一要素に 4 register すべてを書いたモデルが parse し、それぞれ**別々の効果**を持つ（tag → 描画、annotation → バッジ、facet → overlay のみ、boundary → Group-by 時のみ枠）

  > ✅ Automated — `examples/en/feature-samples/tag-facet-registers.krs` が `packages/core/src/examples.test.ts` の parse ガードを通り、`packages/docs-site/scripts/lib/render-examples.test.ts` が en / ja 双方でレンダリングする

### 「受理される語彙は効果を持つか警告される」（TPL-1503）

- [x] AT-C: builtin 外の tag / annotation を書くと警告が出る（第 4 状態の解消 — 受理・無効果・無警告が残っていない）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `tag-not-builtin deprecation warning (#2159)` ほか

- [x] AT-D: `.krs.style` 側で builtin 外の名前を狙うセレクタにも警告が出る（model 側だけでは移行の片側しか見つからない）

  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › `arbitrary-name selector deprecation (#2175)`

- [x] AT-E: facet は **inert ではない** — overlay / `.krs.style` セレクタ / legend / 導出概観の 4 つの効果を持つ

  > ✅ Automated — overlay は `renderer/facet-overlay.test.ts`、セレクタは `resolver/facet-style-selector.test.ts`、legend は `facet-overlay.test.ts` › `facet overlay — legend`、概観は `renderer/facet-overview.test.ts`

### 既定描画への影響ゼロ

- [x] AT-F: facet を宣言・参照しても、overlay 非選択時のレンダリング結果がモデルの他の要素と**バイト単位で同一**

  > ✅ Automated — `packages/core/src/renderer/facet-overlay.test.ts` › `renders identically whether or not the model declares facets`（TPL-2174）

### 多重所属が model 層の原則であること

- [x] AT-G: 1 要素が複数 facet に所属でき、それが診断にならない

  > ✅ Automated — `packages/core/src/parser/facet.test.ts` / `renderer/facet-overlay.test.ts` › `draws one ring per selected facet the node belongs to`

- [x] AT-H: multi-file の merge が所属を**和集合**にする（first-wins で 2 件目を捨てない）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts`（TPL-2161）

- [x] AT-I: 同名ノードが別スコープに 2 つあるとき、**それぞれ別の要素として**扱われる（bare id で融合しない）

  > ✅ Automated — `packages/core/src/renderer/facet-overview.test.ts` › `keeps two same-named nodes in different scopes apart (TPL-1352)`。**これが `facetIndex` を読まずに宣言サイトを歩く理由**で、index を読む実装だと 2 要素が 1 行に潰れて互いの facet を取り違える

### ADR-832 の fence が保たれていること

- [x] AT-J: facet 宣言の文法が `label` / `description` / `link` で**閉じている** — 述語・属性宣言・`policy` ブロックのいずれもパースしない

  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `REFERENCE_DATA.groupingConstructs ↔ parser` が**両向き**に検査する（広告していないプロパティが通ったら落ちる）

- [x] AT-K: facet から検証されるのは「参照先が宣言されているか」のみ（ルールの充足は検証しない = バリデータの書きようが構造的に無い）

  > ✅ Automated — 診断は `facet-not-declared` / `duplicate-facet-id` の 2 種のみで、`packages/core/src/resolver/warnings.test.ts` の `warningSeverity` 網羅マップが facet 由来の kind を列挙する。3 種目が増えたらそのマップがコンパイルエラーになる

### 移行経路が成立していること

- [x] AT-L: `[pci]` → facet 宣言 + `facets pci` + `[facets=pci]` の書き換えで**見た目が変わらない**（specificity 同点）

  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › `scores 10, the same as the tag selector it replaces`。spec の before/after そのものは AT-N の目視

### 目視確認（design doc のチェックリスト由来）

- [ ] AT-M: 🧑 Manual — <https://karasu.kompiro.dev/> で `tag-facet-registers.krs` を開き、**4 register がそれぞれ別のことを言っている**と読めること。とくに `[external]` が何もグルーピングせず、`facets pci` だけが overlay に出ることが「所属とアーキタイプは別物」という主張の目視根拠になる

- [ ] AT-N: 🧑 Manual — user-defined アーキタイプ tag + style + legend の 3 点セットが app で意図どおり見えること（design doc の目視観点 1）

- [ ] AT-O: 🧑 Manual — `[extenal]` の typo hint が出ること（design doc の目視観点 2）。**style セレクタ / legend ref による抑止は無い**ことも確認する — #2159 が抑止条件を設けない判断をしたので、design doc 当時の「消える」という観点は決定によって覆っている

- [ ] AT-P: 🧑 Manual — facet overlay が Group by: team / boundary と**同時に**視認できること（design doc の目視観点 3）

- [ ] AT-Q: 🧑 Manual — `requires_auth` facet で認証境界が drill をまたいで読めること（design doc の目視観点 4）。ADR-832 の refine が実際に何かを買ったかの確認にあたる

- [ ] AT-R: 🧑 Manual — facet を付けても overlay 非選択時の描画が不変であること（design doc の目視観点 5。AT-F の機械検証を実機で追認する）

- [ ] AT-S: 🧑 Manual — 所属一覧パネルを開き、**監査の問い**（「PCI スコープに何が入っているか」）に 1 画面で答えられること。要素側に所属を書く設計の代償を、この導出ビューが実際に払えているかの確認

## 補足 — このプログラムで**やらなかった**こと

記録として残す。いずれも ADR-2065 の「決めないこと」に対応する。

- **ルール言語**は入れていない（恒久的に入れない）。facet が言えるのは「どれが対象か」までで、
  「何を要求するか」は `description` + `link` の prose のまま。
- **明示的除外（excludes tri-state）**は未実装。「評価済み・対象外」と「未評価」を区別したい
  要求が実測されてから記法を決める。監査系 facet を使い始めた人が最初に踏む可能性が高い穴なので、
  watch 対象として roadmap に置いてある。
- **v2.0 の閉鎖そのもの**は実施していない。v1.x で出したのは追加的な deprecation 診断だけで、
  既存モデルは 1 つも壊れない。閉鎖の AT は実施時に別途起こす。
