# AT: 組み込みアノテーションバッジラベルの locale 注入

- **日付**: 2026-06-10
- **関連 Issue**: [#1508](https://github.com/kompiro/karasu/issues/1508)（前段: [#1496](https://github.com/kompiro/karasu/issues/1496)）
- **関連 Design Doc**: [annotation-badge-label-i18n](../design/annotation-badge-label-i18n.md)
- **関連 TPL**: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md), [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md), [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
- **対象ファイル**: `packages/core/src/builtins/default-style.ts`,
  `packages/core/src/index.ts`, `packages/core/src/renderer/{all-layers-svg,drill-down-svg}.ts`,
  `packages/i18n/src/{en,ja,types}.ts`,
  `packages/app/src/i18n/use-annotation-badge-labels.ts`,
  `packages/app/src/hooks/{useSystemView,useDeployView,useOrgView,useViewSvg}.ts`

## 受け入れ条件（自動）

### 単一真実源 — `packages/core/src/builtins/default-style.test.ts`

- [x] 無注入時の builtin バッジラベルが `reference-data.ts` の en ラベルと dark / light 両テーマで一致する（TPL-20260519-02）

  > ✅ Automated — `default-style.test.ts` › `default labels match the reference-data en labels`

- [x] dark のバッジ色は `reference-data.defaultBadge.color` 由来、light は専用色

  > ✅ Automated — `default-style.test.ts` › `dark badge colors come from reference-data` / `light annotation badge colors differ from dark`

- [x] 注入ラベルが 4 アノテーションすべてで反映され、部分注入時は省略キーが en にフォールバックする

  > ✅ Automated — `default-style.test.ts` › `injected labels replace the defaults` / `partially injected labels fall back`

- [x] (theme × ラベル組) ごとにキャッシュが分離され、デフォルトシートが汚染されない

  > ✅ Automated — `default-style.test.ts` › `caches per (theme, label set) without cross-contamination`

- [x] 注入ラベル中の `"` / `\` がエスケープされてシートが壊れない

  > ✅ Automated — `default-style.test.ts` › `escapes quotes and backslashes`

### 全エントリポイント貫通（TPL-20260510-06 / 11）— `packages/core/src/badge-labels-meta.test.ts`

- [x] `annotationBadgeLabels` を受ける全 SVG 生成エントリポイントで、無注入時に en 既定が出る

  > ✅ Automated — `badge-labels-meta.test.ts` › `renders the en default without injection`

- [x] 同じエントリポイントで注入ラベルが en 既定を置き換える

  > ✅ Automated — `badge-labels-meta.test.ts` › `renders the injected label instead`

### app の locale パイプライン — `packages/app/src/i18n/locale-coverage.test.tsx`

- [x] ja 翻訳テーブルに `badge.*` 4 キーが揃っている

  > ✅ Automated — `locale-coverage.test.tsx` › `ja provides all badge keys`

- [x] ja の注入で `@deprecated` バッジが「非推奨」になり、en 既定が出ない

  > ✅ Automated — `locale-coverage.test.tsx` › `ja compile renders the ja @deprecated badge`

- [x] ユーザー `.krs.style` の `badge-label` は注入より優先される（カスケード不変）

  > ✅ Automated — `locale-coverage.test.tsx` › `user .krs.style badge-label still wins`

## 受け入れ条件（手動）

- [ ] app の Settings で locale を en → ja に切り替えると、`@deprecated` ノードのバッジが Deprecated → 非推奨 に追従する（システムビュー / プレビュー再描画後）
- [ ] ja のまま `.krs.style` で `@deprecated { badge-label: "LEGACY"; }` を指定すると、locale を切り替えてもバッジは LEGACY のまま変わらない
- [ ] light テーマ × ja の組み合わせでバッジ色が light 用（#DC2626 系）かつラベルが日本語で表示される
