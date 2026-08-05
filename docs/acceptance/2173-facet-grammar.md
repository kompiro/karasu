# AT: facet grammar + model — declaration block, `facets` property, `facetIndex`, diagnostics

- **日付**: 2026-07-30
- **関連 Issue**: [#2173](https://github.com/kompiro/karasu/issues/2173)（tags-and-facets Part B slice 1、親 [#2160](https://github.com/kompiro/karasu/issues/2160) / [#2065](https://github.com/kompiro/karasu/issues/2065)）
- **ADR**: 未昇格（Part B 全 slice 完了後。設計は親 Issue [#2160](https://github.com/kompiro/karasu/issues/2160) / [#2065](https://github.com/kompiro/karasu/issues/2065) から辿る）
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md)（Cross-cutting membership (`facet`)）/ [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)（Vocabulary registers）/ [`docs/spec/diagnostics.md`](../spec/diagnostics.md)
- **関連 TPL**: [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)（cross-reference は resolver 検証 + unresolved warning）/ [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（多重所属を派生 index で捨てない）/ [TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)（マージ後空間で検証）/ [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（round-trip）/ [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理語彙は効果を持つ）/ [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)（受理形は spec に文書化）
- **対象ファイル**:
  - `packages/core/src/lexer/lexer.ts` / `packages/core/src/types/tokens.ts`（`facet` / `facets` キーワード）
  - `packages/core/src/types/ast.ts`（`FacetBlock`、`BaseNodeFields.facets`、`KrsFile.facets` / `facetIndex`、`duplicate-facet-id`）
  - `packages/core/src/parser/parser.ts` / `reference-validation.ts`（宣言・プロパティ・index・重複検証）
  - `packages/core/src/fs/import-resolver.ts`（宣言のマージと index の再構築）
  - `packages/core/src/resolver/warnings.ts` / `packages/core/src/types/warnings.ts`（`facet-not-declared`）
  - `packages/core/src/formatter/formatter.ts`（宣言ブロックと `facets` プロパティの出力）
  - `packages/i18n/src/{types,en,ja,render-diagnostic,render-warning}.ts`

> スコープは **描画より下の一式**（parse / AST / index / merge / fmt / 診断 / spec）。
> overlay 描画（slice 2）、`.krs.style` の facet セレクタ（slice 3）、概観パネル・examples
> （slice 4）、edge への `facets`、明示的除外の tri-state は対象外。

## 受け入れ条件

- [x] AT-A: 宣言ブロックが `label` / `description` / `link` を受理し、`contains` と述語形（`requires ...`）と位置ラベルを拒否する（ADR-832 の fence / ADR-19）

  > ✅ Automated — `packages/core/src/parser/facet.test.ts` › `facet declaration block` › `parses id + label / description / link` / `rejects `contains` — the declaration has no membership list` / `rejects an unknown property` / `rejects a positional label (ADR-19)`

- [x] AT-B: ノードブロック内の `facet` 宣言はブロックごと消費され、診断 1 件で回復する（後続の兄弟ノードが壊れない）

  > ✅ Automated — 同 describe › `recovers from a nested declaration with one diagnostic, not a cascade`

- [x] AT-C: `facets` が全 13 node kind（system / service / client / domain / usecase / entity / resource / user / database / queue / storage / table / queue-item / bucket）で受理される

  > ✅ Automated — `packages/core/src/parser/facet.test.ts` › `facets is accepted on every node kind`（kind ごとに 1 ケース）、および `packages/core/src/parser/base-node-fields-coverage.test.ts` の `facets` フィールド × 全 kind 総当たり

- [x] AT-D: 複数行の `facets` と重複 id が冪等にマージされ、診断を出さない

  > ✅ Automated — 同ファイル › `facets property` › `merges repeated `facets` lines` / `collapses a duplicate id idempotently, without a diagnostic`

- [x] AT-E: `facetIndex` が 1:N（2 facet 所属 → 要素 1 件に 2 件、診断なし）で、top-level orphan と infra leaf を含む全 depth を index する

  > ✅ Automated — 同ファイル › `facetIndex` › `is 1:N — a node in two facets keeps both` / `does not report multi-membership as a diagnostic` / `indexes nodes at every depth, including infra leaves` / `indexes top-level orphan nodes and their descendants`

- [x] AT-F: 未宣言の facet 参照は `facet-not-declared`（warning）になり、宣言済みの参照は無音

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `facet-not-declared (#2173)` › `warns when a `facets` reference names no declaration` / `stays silent when every reference resolves` / `reports only the undeclared id when a node mixes declared and undeclared` / `checks references on every kind, including infra leaves`

- [x] AT-G: 宣言が別ファイルにあっても警告が出ない（マージ空間で検証）。宣言がどこにも無ければ出る

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › `facet across files (#2173)` › `merges declarations from an imported file` / `leaves no undeclared reference when the declaration is imported`、および AT-F の単一ファイル側ケース

- [x] AT-H: 同一 id の宣言重複は `duplicate-facet-id`（error）。ファイル横断でも検出し、同一ファイル内の重複を二重報告しない

  > ✅ Automated — `packages/core/src/parser/facet.test.ts` › `reports a re-declared id as duplicate-facet-id and keeps the first`、`packages/core/src/fs/import-resolver.test.ts` › `reports a duplicate declaration split across two files` / `reports a duplicate inside one file exactly once, not twice` / `does not report distinct declarations from different files`

- [x] AT-I: マージ経路が多重所属を切り詰めない（別ファイルで同ノードを再オープンして facet を足しても union される）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › `unions membership when the same node is reopened in another file`

- [x] AT-J: fmt round-trip — 宣言ブロックと **per-node の `facets` プロパティ**の双方が保存され、正規化後は idempotent

  > ✅ Automated — `packages/core/src/formatter/facet-round-trip.test.ts`（全 7 ケース: nested node / 全 kind / 正規化 / `{}` 潰れ防止 / 宣言の label プロパティ形 / top-level 順序 / quoted id）、および `packages/core/src/formatter/formatter-top-level-coverage.test.ts` の `facets` フィクスチャ（top-level 配列の網羅ガード）

- [x] AT-K: `facet-not-declared` の register は warning（info ではない）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `warningSeverity — exhaustive register map` › `facet-not-declared → warning`、および同 describe 末尾の `is a warning, never info`

- [x] AT-L: en / ja の両診断メッセージが id を含んでレンダリングされる

  > ✅ Automated — `packages/i18n/src/render-diagnostic.test.ts`（`duplicate-facet-id` のサンプル + IDENTIFIERS）/ `packages/i18n/src/render-warning.test.ts`（`facet-not-declared` のサンプル + IDENTIFIERS）

- [x] AT-M: 診断カタログ（`docs/spec/diagnostics.md` +ja）に 2 コードの行がある

  > ✅ Automated — `packages/core/src/types/diagnostics-catalog.test.ts`（TPL-1623 の網羅性メタテスト）

- [x] AT-N: kind カタログと parser の受理が双方向で一致する（`facets` を広告する kind ≡ 受理する kind）

  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › `every listed property parses, and every property that parses is listed`（kind ごと）/ `covers every property keyword the lexer knows`

- [x] AT-O: 新キーワードが LSP 補完の triage を通っている（`facet` / `facets` が補完に載り、除外リストとの整合が取れている）

  > ✅ Automated — `packages/lsp/src/completion-keywords.test.ts` › `offers only recognized keywords` / `excludes exactly the explicitly-triaged block-scoped keywords`

### 手動確認（CI で検証できない項目）

N/A — 本 slice は描画面を持たない（overlay / セレクタ / 概観は後続 slice）。既定描画が
変わらないことは、facet を書かないモデルの AST・描画に一切変更が無いこと
（既存 2712 テストの全通過）で担保される。
