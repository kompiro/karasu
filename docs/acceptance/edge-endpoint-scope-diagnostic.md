---
type: product
---

# AT: 宣言スコープで描画できない edge endpoint の診断（#2075）

- **日付**: 2026-07-30
- **関連 Issue**: [#2075](https://github.com/kompiro/karasu/issues/2075)
- **Related TPLs**: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)（parse を通った構造は描画されるか診断される）, [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)（同じ状態を表す配置は同じ診断を出す）, [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md)（cross-domain entity 参照は限定子付き）, [TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md)（LSP 単一ドキュメント文脈での挙動を明示的に決めて記録する）
- **対象ファイル**:
  - `packages/core/src/types/warnings.ts`（`edge-endpoint-not-at-scope` の kind / params）
  - `packages/core/src/resolver/warnings.ts`（`detectEdgeEndpointsNotAtScope`）
  - `packages/i18n/src/en.ts` / `ja.ts` / `types.ts` / `render-warning.ts`（メッセージ 2 variant）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Endpoint scope / §端点のスコープ）
  - `docs/spec/diagnostics.md` / `diagnostics.ja.md`（カタログ 1 行）

> edge はそれを宣言したブロックを描画するビューにしか描かれない。endpoint がそのスコープの peer でない edge は全ビューから落ちるため、`edge-endpoint-not-at-scope`（warning）で報告する。実際に描画される 2 配置（cross-service の domain→domain / 限定子付き entity 関連）では発火しない。

## 受け入れ条件

### AC-1: silent drop していた配置が診断される

- [x] AT-A: `system` スコープの `A -> B`（A, B は service 配下の domain）で warning が出る。params が endpoint / owner / scope を伴う

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › warns when a system-scope edge names a domain nested in a service

- [x] AT-B: 残る 5 配置（service スコープ→他 service の domain / domain スコープ→usecase / system スコープ→nested usecase / dotted 無しの cross-system service 参照 / bare id の cross-domain entity 関連）でも同じ診断が出る

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning（warns … の 5 ケース）

### AC-2: 描画される配置では発火しない（false positive 防止）

- [x] AT-C: 正準形の domain-anchored edge、cross-service の domain→domain、限定子付き cross-domain entity 関連で warning が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning（does not warn … の 3 ケース）

- [x] AT-D: 別ファイルでの `system` 再オープン（S3）を**実際の ImportResolver でマージした後**は warning が出ない。一方、同一ファイル内の同 id `system` ブロック 2 つはマージされないため warning が出る（peer はブロック単位）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › edge-endpoint-not-at-scope across a system reopen (#2075)（cross-file 2 ケース）／ `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › warns across a same-file reopened system block

- [x] AT-D2: 同じ `domain` id が 2 つの service に分散しているとき、別インスタンス配下の entity への bare 参照が warning になる（peer をインスタンス単位で数えている）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › warns when a dispersed domain id makes a bare entity relation look local

- [x] AT-D3: トップレベル orphan の service は peer ではない（warning が出る）が、orphan の domain は drawio 経路で描画されるため warning が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › warns when a system-scope edge names a top-level orphan service ／ does not warn when a system-scope edge names a top-level orphan domain

- [x] AT-E: dotted ref では発火せず、モデルに存在しない id は `unresolved-edge-endpoint` のみが担当する（二重報告しない）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › does not warn for a dotted cross-system ref ／ leaves an endpoint absent from the model to unresolved-edge-endpoint

- [x] AT-F: 既存の examples / spec の `.krs` が新たに警告しない（examples は実際の `ImportResolver` でマージしてから判定する）

  > ✅ Automated — `packages/core/src/examples.test.ts` › examples: every shipped .krs is free of edge-endpoint-not-at-scope（78 entry files, 0 hits）／ `spec-syntax.test.ts`

### AC-3: 診断が全レイヤーに配線されている

- [x] AT-G: en / ja のメッセージが未解決プレースホルダなしで描画され、ja が en と異なる

  > ✅ Automated — `packages/i18n/src/render-warning.test.ts` › kind: edge-endpoint-not-at-scope

- [x] AT-H: 診断カタログ（`docs/spec/diagnostics.md` / `.ja.md`）に項目がある

  > ✅ Automated — `packages/core/src/types/diagnostics-catalog.test.ts` › diagnostics catalog completeness (TPL-1623)

- [x] AT-I: severity が `warning` レジスタである

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › warningSeverity › edge-endpoint-not-at-scope → warning

- [x] AT-J: LSP の単一ドキュメント文脈で、同一ドキュメント内に解決する endpoint には発火し、別ファイル宣言の endpoint（import 結合）には発火しない（TPL-1522 の side を記録・検証）

  > ✅ Automated — `packages/lsp/src/diagnostics.test.ts` › surfaces edge-endpoint-not-at-scope when the endpoint resolves in this document ／ stays silent when the edge's endpoint lives in another file (import-coupled)

### 手動確認

- [ ] M-1: Issue の再現 `.krs`（`system T { service S { domain A … domain B … } A -> B }`）を `karasu render` にかけると warning が 2 件（endpoint ごと）出力され、exit code は 0 のまま（warn-don't-error）
- [ ] M-2: 正準形（`domain A { -> B }`）では warning が出ず、service ドリルダウンに矢印が描画される
- [ ] M-3: app の Warning パネルに当該 warning が表示され、詳細行に修正ヒント（source ブロックに書く／限定子を付ける）が出る
- [ ] M-4: locale を ja にしたとき、メッセージとヒントが日本語で表示され、識別子の前後の空白が崩れていない
- [ ] M-5: VS Code 拡張（LSP 経由）で同じ warning が該当行に表示される
