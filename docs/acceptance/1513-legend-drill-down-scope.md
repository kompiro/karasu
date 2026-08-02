# AT: ドリルダウンビューの凡例切り替え（legend service / domain）

- **日付**: 2026-06-11
- **関連 Issue**: [#1513](https://github.com/kompiro/karasu/issues/1513)
- **関連 ADR**: [ADR-1513](../adr/1513-legend-drill-down-scope.md)
- **関連 TPL**: [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
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

### AC-3: Phase 0 配管とパリティ（TPL-219）

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

### AC-4: app preview でのドリルダウン凡例切り替え（TPL-1223）

`examples/en/feature-samples/legend.krs` の内容を `index.krs` として app で開いて確認する。

> ✅ Automated by `packages/e2e/tests/at-1513-legend-scope.spec.ts` (suite-wide)

- [x] トップレベルで「Owner team」凡例（省略スコープ）が図の下に表示される
- [x] EC Site サービスへドリルダウンすると凡例が「Service internals」に切り替わる（「Owner team」は消える）
- [x] Order ドメインへドリルダウンすると凡例が「Domain vocabulary」に切り替わる
- [x] パンくずでトップレベルに戻ると「Owner team」凡例が再表示される

> Test: `the legend follows the drill-down level and returns on breadcrumb home (AC-4)`。
> fixture は AC-4 の指示どおり `examples/en/feature-samples/legend.krs` を**ファイルから読んで**
> `index.krs` として seed する（インラインコピーにしないので、example が変わればここで落ちる）。
> 各レベルで前のスコープの凡例が**消えている**ことも assert する（完全一致セマンティクス）。
> 戻り（パンくず）も assert 対象（TPL-20260518-01: 往復の両方向を描画させる）。

### AC-5: all-layers ビューでの凡例表示位置

- [x] all-layers ビューで、トップレベル帯・service 帯・domain 帯がそれぞれ自分のスコープの凡例を持ち、深度順に並ぶ

> ✅ Automated — `packages/e2e/tests/at-1513-legend-scope.spec.ts` › `all-layers stacks each band's own legend below it, in depth order (AC-5)` — all-layers は `<iframe srcDoc>` に描画されるため frame 内で `getBoundingClientRect` を読み、「ずれていないか」を目視で判断する代わりに**縦位置の順序**（top → service → domain）を assert する。deploy スコープの凡例が system スタックに漏れないことも確認する。

- [ ] 帯と凡例の余白・視覚的な近接（どの帯に属するか一目で分かるか）

> manual / visual review — 順序は自動化済みだが、帯と凡例の距離が「同じ帯のものだと読める」かは目視判断。

> 未チェック項目について:
>
> - AC-4 / AC-5 の切り替わりと並び順は `packages/e2e/tests/at-1513-legend-scope.spec.ts`
>   で自動化した（#2049 item 5）。残る目視は帯と凡例の視覚的近接のみ。

## 検証方法

```bash
# 自動テスト
pnpm --filter @karasu-tools/core test

# 人間確認は本番 app（https://karasu.kompiro.dev/）で行う。
# examples/en/feature-samples/legend.krs を index.krs として開く。
```
