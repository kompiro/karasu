---
type: feature
---

# AT-1381: multi-file import semantics — whole-file import, system reopen, DAG re-arrival

- **日付**: 2026-05-14
- **関連 Issue**: [#1381](https://github.com/kompiro/karasu/issues/1381)
- **対象ファイル**:
  - `packages/core/src/fs/import-resolver.ts`（Pass 1 / Pass 2 の visited / cache 設計、merge の identity dedup、`system-property-conflict` 警告）
  - `packages/core/src/types/ast.ts`（`system-property-conflict` 診断追加）
  - `packages/core/src/parser/diagnostic-legacy-format.ts`（同上の整形）
  - `packages/app/src/i18n/{types,en,ja}.ts`（同上の翻訳）
  - `packages/core/src/fs/import-resolver.test.ts`（spec §"Multi-file import semantics" S2/S3/S4/S5 を assert する describe block）
  - `examples/multi-file-system/{index,reader,editor,cms}.krs`（spec PR で追加済み、本 AT で end-to-end を検証）
- **Spec**: `docs/spec/syntax.md` §「Multi-file import semantics」(S1〜S7)
- **TPL**: TPL-20260514-01 〜 TPL-20260514-05
- **ADR**: [ADR-20260514-01](../adr/20260514-01-multi-file-import-semantics.md)

## 受け入れ条件

- [ ] AT-A: DAG 経由で同じファイルに 2 経路で到達しても `circular-import` 警告が出ない (S5)。真の循環（A → B → A）では引き続き警告が出る
  > ✅ Automated — `import-resolver.test.ts` の `"S5: DAG re-arrival ..."` / `"S5: a true cycle still produces ..."` ケース

- [ ] AT-B: ある imported ファイルが先に named import で参照されても、別経路の whole-file import でそのファイルの全 top-level / nested ノードが merged モデルに現れる (S2)
  > ✅ Automated — `import-resolver.test.ts` の `"S2: whole-file import preserves all top-level + nested nodes ..."` ケース

- [ ] AT-C: 同名 `system` の再オープン時、root entry の `label` / `description` が優先される (S3)。importer 側が未設定なら imported の値で埋まり警告なし、両者が異なる non-empty 値で衝突したら `system-property-conflict` 警告（採用 / 無視 / 両者の location 付き）が出る
  > ✅ Automated — `import-resolver.test.ts` の `"S3: reopened ..."` / `"S3: importer with no label ..."` ケース

- [ ] AT-D: 同名 `deploy` / `organization` も union merge され、children / teams / member が全部結合される (S4)
  > ✅ Automated — `import-resolver.test.ts` の `"S4: same-id deploy and organization blocks merge ..."` ケース

- [ ] AT-E: `examples/multi-file-system/index.krs` を `karasu render` した SVG に、4 ファイル全てに宣言された全ノード・全 deploy node・全 team が現れる
  > ✅ Automated — `import-resolver.test.ts` の `"S2 + S4: end-to-end on the examples/multi-file-system fixture"` ケース（実ファイルをドライブ）

- [ ] AT-F（manual）: App / VS Code 拡張で `examples/multi-file-system/index.krs` を開き、`label` が「ブログプラットフォームデモ」になっていること、reader.krs / editor.krs を直接開くと各々の `label` (`Reader slice` / `Editor slice`) が表示されることを目視確認する（root-entry 優先と WYSIWYG メンタルモデルの一致）
  > 🧑 Manual — App での開き分けと label 切り替えを目視

- [ ] AT-G（manual）: `karasu render examples/multi-file-system/index.krs --view deploy` および `--view org` で 4 container / 3 team が描画されていることを目視確認する
  > 🧑 Manual — SVG を目視

- [ ] AT-H: merged モデルに存在しない id を指すエッジは drop され（解決できた側のノードは残る — TPL-20260514-05）、`unresolved-edge-endpoint` 警告が出る (S6)。cross-system dotted ref（`Sys.Svc`）はこの警告の対象外（`cross-system-ref-*` が担当）。単一ドキュメントの LSP 文脈では import 未解決のため抑制される
  > ✅ Automated — `warnings.test.ts` の `"unresolved-edge-endpoint warning"` describe（dangling / resolved / ghost-domain / cross-system / domain-edge ケース）

## 関連

- ADR: `docs/adr/20260514-01-multi-file-import-semantics.md`
- 仕様化 PR: #1383 (merged)
- 実装 PR: 本 PR
- AT-H（S6 警告）実装: #1569
- 関連 TPL: [TPL-20260514-05](../test-perspectives/TPL-20260514-05-dangling-edge-preserves-node.md)（ノード保持の半分。本 AT で警告の半分も担保）
