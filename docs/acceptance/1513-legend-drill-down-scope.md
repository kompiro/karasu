# AT: ドリルダウンビューの凡例切り替え（legend service / domain）

- **日付**: 2026-06-11
- **関連 Issue**: [#1513](https://github.com/kompiro/karasu/issues/1513)
- **関連 ADR**: [ADR-20260611-02](../adr/20260611-02-legend-drill-down-scope.md)
- **関連 TPL**: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md), [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md), [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)
- **対象ファイル**: `packages/core/src/parser/parser.ts`,
  `packages/core/src/types/ast.ts`, `packages/core/src/renderer/svg-builder.ts`,
  `packages/core/src/renderer/{svg-renderer,drill-down-svg,all-layers-svg}.ts`,
  `packages/core/src/index.ts`

## 概要

`legend` の view-scope 語彙に論理ドリルダウン深度 `service` / `domain` を追加し、
描画レベルとスコープの**完全一致**で凡例を切り替える（深さをまたぐ重ね合わせなし）。
あわせてドリルダウン / all-layers / all-views の各レンダーパスに legend オプションを
配管する（Phase 0）。

## 受け入れ条件（自動）

### AC-1: 文法 — `packages/core/src/parser/parser.test.ts`

- [x] `legend service` / `legend domain` がスコープとしてパースされる

  > ✅ Automated — `parser.test.ts` › `parses each view-scope variant`

- [x] `legend "service catalog"` のように文字列が直後に来る場合はタイトルとして扱われる（スコープ語彙拡張のリグレッション確認）

  > ✅ Automated — `parser.test.ts` › `treats a scope-less legend starting with a string title as unscoped`

### AC-2: 完全一致セマンティクス — `packages/core/src/renderer/legend-footer.test.ts`

- [x] スコープ × 描画レベルの表示マトリクス全 30 組（省略 / system / service / domain / deploy / org × 5 描画スコープ）

  > ✅ Automated — `legend-footer.test.ts` › `legendScopeMatches (Issue #1513)` (suite-wide)

- [x] トップレベルには省略 + `system` のみ、service ドリルダウンには `service` のみ、domain ドリルダウンには `domain` のみが表示される

  > ✅ Automated — `legend-footer.test.ts` › `legend scope switching across drill-down levels (Issue #1513)` (suite-wide)

- [x] system を root にしたドリルダウンレベルには凡例が出ない（スコープ語彙が無いため）

  > ✅ Automated — `legend-footer.test.ts` › `shows no legend on a system-rooted drill-down level (no scope keyword for it)`

- [x] `service` / `domain` スコープが deploy / org ビューに漏れない

  > ✅ Automated — `legend-footer.test.ts` › `keeps depth scopes out of the deploy view` / `keeps depth scopes out of the org view`

### AC-3: Phase 0 配管とパリティ（TPL-20260510-11）

- [x] 単一 SVG ドリルダウンの各レベルが自分の深度スコープの凡例だけを持つ

  > ✅ Automated — `drill-down-svg.test.ts` › `each level shows exactly the legends scoped to its depth`

- [x] 既存スコープ（省略 / system / deploy / org）のみのファイルはドリルダウンレベルに凡例を描画しない（後方互換 opt-in）

  > ✅ Automated — `drill-down-svg.test.ts` › `keeps drill-down levels legend-free for files using only pre-#1513 scopes`

- [x] all-views バンドルの deploy ペインに deploy スコープの凡例が描画される

  > ✅ Automated — `drill-down-svg.test.ts` › `renders the deploy-scoped legend on the bundled deploy pane`

- [x] トップレベル / drill-down / all-layers / all-views の全パスが同じ legend オプションを受ける（パリティ drift 防止）

  > ✅ Automated — `drill-down-svg.test.ts` › `drill-down and all-layers carry the same legends as the top-level compile`

- [x] all-layers の各レベル帯が自分の深度スコープの凡例だけを帯内に持つ

  > ✅ Automated — `all-layers-svg.test.ts` › `each stacked band carries only the legends for its own depth scope`

## 受け入れ条件（人間確認）

### AC-4: app preview でのドリルダウン凡例切り替え（TPL-20260510-21）

`examples/en/feature-samples/legend.krs` の内容を `index.krs` として app で開いて確認する。

- [ ] トップレベルで「Owner team」凡例（省略スコープ）が図の下に表示される
- [ ] EC Site サービスへドリルダウンすると凡例が「Service internals」に切り替わる（「Owner team」は消える）
- [ ] Order ドメインへドリルダウンすると凡例が「Domain vocabulary」に切り替わる
- [ ] パンくずでトップレベルに戻ると「Owner team」凡例が再表示される

### AC-5: all-layers ビューでの凡例表示位置

- [ ] all-layers ビューで、トップレベル帯の直下に「Owner team」、service 帯の直下に「Service internals」、domain 帯の直下に「Domain vocabulary」がそれぞれ表示され、位置が帯とずれない

> 未チェック項目について:
>
> - AC-4 / AC-5 は SVG 上の視覚的な切り替わり・配置の判定が必要なため人間確認に残す。
>   表示内容自体（どのレベルにどの凡例が含まれるか）は AC-2 / AC-3 で自動化済み。

## 検証方法

```bash
# 自動テスト
pnpm --filter @karasu-tools/core test

# 人間確認: app を起動して examples/en/feature-samples/legend.krs を index.krs として開く
pnpm --filter @karasu-tools/app dev
```
