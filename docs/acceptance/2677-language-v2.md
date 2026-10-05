# AT: 言語 v2.0 の実施（語彙の閉鎖・`facet` の core 昇格・2 つの error 化）

- **日付**: 2026-10-05
- **関連 Issue**: [#2677](https://github.com/kompiro/karasu/issues/2677)（tag / annotation 語彙の閉鎖 + `facet` の core 昇格）、[#2924](https://github.com/kompiro/karasu/issues/2924)（`node-not-in-context` の error 化）
- **対象ファイル**:
  - `packages/core/src/language-version.ts`
  - `packages/core/src/builtins/tool-vocabulary.ts`、`packages/core/src/style/cascade.ts`
  - `packages/core/src/parser/parser.ts`、`packages/core/src/resolver/warnings.ts`
  - `packages/core/src/translate/{openapi,db}.ts`
  - `packages/vscode/src/{render-gate,preview-panel}.ts`
  - `packages/i18n/src/{types,en,ja,render-diagnostic,render-warning}.ts`
  - `docs/spec/{syntax,style,tags-annotations,diagnostics}.md`（+ ja）、`docs/concepts.md`（+ ja）
- **関連 ADR**: [ADR-2065](../adr/2065-tags-and-facets.md)（register の確定と v2.0 の到達点）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語版のセマンティクス）、[ADR-2124](../adr/2124-version-vocabulary.md)（版語彙）、[ADR-2165](../adr/2165-logical-containment-rules.md)（containment 規則）、[ADR-2208](../adr/2208-positional-label-error-promotion.md) / [ADR-2501](../adr/2501-errored-edge-declaration-renders-nowhere.md)（error のある間は描かない）
- **関連 TPL**: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md)、[TPL-2165](../test-perspectives/TPL-2165-containment-rule-has-single-definition.md)

## 受け入れ条件

- [x] AT-A: `karasu --version` が 2 行目に `.krs language v2.0` を表示し、spec 4 文書がその版を明記して古い版を名乗らない
  > ✅ Automated — `packages/cli/src/version.test.ts` › `prints two lines: package version and canonical language version`
  > ✅ Automated — `packages/core/src/language-version.test.ts` › `%s does not state a stale language version`

- [x] AT-B: ツール語彙の外の tag / annotation を名指す `.krs.style` のルールは丸ごと何にも一致しない（`service[pci]` が全 service に広がらない）
  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › `no longer applies a rule whose selector names a non-builtin tag (v2.0)`
  > ✅ Automated — `packages/core/src/builtins/tool-vocabulary.test.ts` › `keeps builtin and system-assigned names and drops the rest, rule by rule`

- [x] AT-C: builtin テーマのルールとツールが自動付与するタグは全てツール語彙に入っており、`delivers` エッジは builtin テーマのスタイルを保つ
  > ✅ Automated — `packages/core/src/builtins/tool-vocabulary.test.ts` › `every tag literal the source stamps on an element is a tool tag`
  > ✅ Automated — `packages/core/src/builtins/tool-vocabulary.test.ts` › `styles delivers edges with the builtin theme`

- [x] AT-D: legend の ref と `style-conflict` の判定も同じ規則に従う（効かないルールで ref が解決されず、効かないルールどうしは衝突しない）
  > ✅ Automated — `packages/core/src/builtins/tool-vocabulary.test.ts` › `a legend ref resolves no longer through a rule on a non-builtin name`
  > ✅ Automated — `packages/core/src/builtins/tool-vocabulary.test.ts` › `two sheets declaring the same dead rule do not conflict over anything`

- [x] AT-E: 組み込み annotation 名の綴り誤り（`@depracated`）は `annotation-possible-typo` error になり、annotation はモデルに入らない。距離規則（4 文字以下は 1 編集、それより長ければ 2 編集）の内外が仕様どおりに分かれる
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `rejects a near-miss of a builtin annotation and keeps it out of the model`
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `treats @%s as a misspelling of @%s (inside the budget)`

- [x] AT-F: `canContain` に無い入れ子（`service` 直下の `usecase` など）は `node-not-in-context` error になり、ノードは subtree ごとモデルから除かれ、後続はパースされる
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `rejects a misplaced node and keeps it (with its subtree) out of the tree`

- [x] AT-G: `karasu translate --from openapi` と `--from db --emit-bindings` の出力は usecase を仮置きの domain に入れ、error なくパースされる
  > ✅ Automated — `packages/core/src/translate/openapi.test.ts` › `parses with no errors at %s granularity`
  > ✅ Automated — `packages/core/src/translate/bindings.test.ts` › `AT-8: emitted output parses without errors`

- [x] AT-H: VS Code のプレビューは error のある間、回復した部分モデルを描かず、同じ対象の直前の有効な図を保つ
  > ✅ Automated — `packages/vscode/src/render-gate.test.ts` › `never draws the partial model core recovered`
  > ✅ Automated — `packages/vscode/src/render-gate.test.ts` › `keeps the last valid render while the compile target is unchanged`

- [x] AT-I: Reference データで `facet` が experimental として扱われない
  > ✅ Automated — `packages/core/src/builtins/reference-top-level-coverage.test.ts` › `flags boundary experimental and facet no longer (facet is core from language v2.0, #2677)`

## 手動確認

- [ ] AT-M1: app で error のある間は図が更新されず、直すと描画が再開する
  > 🖐 手動確認 — https://karasu.kompiro.dev/ で有効なモデルを描画させてから、`service Legacy @depracated {}` を書き足す。error が表示され図が直前のまま残ること、`@deprecated` に直すと描画が戻ることを確認する。`service Api { usecase U {} }` でも同じ
- [ ] AT-M2: VS Code 拡張のプレビューでも同じ挙動になる（Problems パネルに Error、プレビューは直前の図のまま、別のビューに切り替えると描画できない旨の表示）
  > 🖐 手動確認 — 拡張ホストで同じ `.krs` を開いて編集する
