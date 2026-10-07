# AT: 論理ノードの containment 規則（`node-not-in-context`）

- **日付**: 2026-07-30
- **関連 Issue**: [#2165](https://github.com/kompiro/karasu/issues/2165)
- **対象ファイル**:
  - `packages/core/src/builtins/reference-data.ts`（`system.canContain` + `LOGICAL_CONTAINMENT`）
  - `packages/core/src/parser/parser.ts`
  - `packages/core/src/types/ast.ts`（`node-not-in-context` の params）
  - `packages/i18n/src/{types,en,ja,render-diagnostic}.ts`
  - `docs/spec/syntax.md` / `syntax.ja.md`（§Nesting placement / §入れ子の配置）、`docs/spec/diagnostics.md` / `.ja.md`
- **関連 ADR**: [ADR-2165](../adr/2165-logical-containment-rules.md)（本件の決定。設計は [PR #2171](https://github.com/kompiro/karasu/pull/2171) の Design Doc として起こし、本 ADR に集約）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze — warning に留める根拠）、[ADR-681](../adr/681-top-level-service-rendering.md) / [ADR-702](../adr/702-top-level-infra-rendering.md)（未割り当てノード）、[ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（規則 ↔ 診断）
- **関連 TPL**: [TPL-2165](../test-perspectives/TPL-2165-containment-rule-has-single-definition.md)（同 PR で新設）、[TPL-2158](../test-perspectives/TPL-2158-catalog-fenced-against-parser-not-generated-doc.md)、[TPL-2171](../test-perspectives/TPL-2171-spec-promised-diagnostics-implemented.md)

## 受け入れ条件

- [x] AT-A: `system { domain D {} }` が診断ゼロで parse される（service に未割り当ての domain は正当な状態 — ADR-681 / ADR-702）
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `accepts a domain declared directly inside a system`

- [x] AT-B: `client { usecase U {} }` が `node-not-in-context` を発行する。言語 v1.x では **warning**、`.krs language v2.0` から **error**（[#2924](https://github.com/kompiro/karasu/issues/2924)）
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `rejects a logical node nested outside its parent's canContain as an error`

- [x] AT-C: `.krs language v2.0` では、置き場所を誤ったノードは subtree ごと AST から除かれ、後続のブロックは通常どおりパースされる（言語 v1.x ではノードを保持して描画していた）
  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `rejects a misplaced node and keeps it (with its subtree) out of the tree`

- [x] AT-D: `canContain` に載っている入れ子と、parser が warning なしで受理する入れ子が完全一致する（双方向）
  > ✅ Automated — `packages/core/src/builtins/reference-parser-sync.test.ts` › ``​`%s`: canContain matches exactly the children the parser accepts without `node-not-in-context``（全 14 kind）

- [x] AT-E: 出荷している `examples/**/*.krs` 全件が `node-not-in-context` ゼロ
  > ✅ Automated — `packages/core/src/examples.test.ts` › `examples: every shipped .krs is free of node-not-in-context warnings`

- [x] AT-F: 診断メッセージが en / ja 両ロケールで描画され、`childKind` / `parentKind` が本文に現れる
  > ✅ Automated — `packages/i18n/src/render-diagnostic.test.ts`（`IDENTIFIERS` テーブルの `node-not-in-context` 行 + 非空 / ja≠en assertion）

- [x] AT-G: `node-not-in-context` が `docs/spec/diagnostics.md` / `.ja.md` の規則カタログに 1 行を持つ
  > ✅ Automated — `packages/core/src/types/diagnostics-catalog.test.ts`（診断コード ↔ カタログの双方向完全性、TPL-1623）

- [x] AT-H: `docs/spec/syntax.md` / `syntax.ja.md` の Logical structure 表で `system` の May contain に `domain` が入り、`domain` 行の説明が 3 つの配置を述べる
  > ✅ Automated — `pnpm gen:reference --check`（lefthook pre-push / `ci.yml` / `reference-docs-check.yml`）

- [ ] AT-I: app で `node-not-in-context` が error として表示され、error を直すまで図は更新されない（直前の有効な図が出たまま）。直すと描画が再開する（`.krs language v2.0`）
  > 🖐 手動確認 — app（https://karasu.kompiro.dev/）を開き、有効なモデルを描画させてから `system S { client C { usecase U {} } }` を入力し、診断の severity とキャンバスを確認する

- [ ] AT-J: VS Code 拡張で同じ診断が Problems パネルに Error として出て、プレビューは直前の有効な図のまま（または描画できない旨の表示）になる（`.krs language v2.0`）
  > 🖐 手動確認 — 拡張ホストで同じ `.krs` を開く

## 備考

error 化は v1.0 freeze（ADR-1314）に抵触するため次 major に送り、`docs/roadmap.md`
§Syntax 2.0 の追跡表に登録した。移行期間中に warning を出しておくことで、v2.0 で
error にしたときの破壊面が事前に観測できる。`.krs language v2.0`（#2924）で error 化を
実施し、AT-B / AT-C / AT-I / AT-J を v2.0 の挙動に改めた。
