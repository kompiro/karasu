# AT-2421: kind の色語彙 — 塗りなし usecase・slate resource・同色相の deploy 塗り

- **日付**: 2026-08-11
- **関連 Issue**: [#2421](https://github.com/kompiro/karasu/issues/2421)（kind hue vocabulary、親 [#2366](https://github.com/kompiro/karasu/issues/2366) の Phase 4 スライス B）
- **関連 ADR**: [ADR-1479](../adr/1479-svg-diagram-theming.md)（テーマ機構と light badge 色）、[ADR-8](../adr/8-builtin-style-and-reference.md)（ビルトインスタイルの一元化）
- **Related TPLs**: [TPL-2421](../test-perspectives/TPL-2421-kind-color-hue-table.md)（色相表からの導出）、[TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md)（fill ⇔ text の対）、[TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)（canvas 上の文字のコントラスト）
- **対象**: `packages/core/src/builtins/default-style.ts`、`packages/core/src/renderer/svg-builder.ts`、`docs/spec/style.md` / `style.ja.md`

## 概要

kind の配色を 2 つの規則と色相表に畳む。論理層は同一配色だった 4 kind を塗りで分離し
（`usecase` は塗りなし、`resource` は中立 slate、`domain` は navy 継続、`member` は形状で分離済み）、
deploy kind は accent と同色相の低明度塗り + 高明度文字にして、どの色相にも属さない濁色を全廃する。
規則は `docs/spec/style.md` §「Kind color vocabulary」に載り、導出結果はコントラストガードが検証する。

## 受け入れ条件

### AC-1: 論理層の 4 kind が色で区別できる

- [x] dark / light 両テーマで `usecase` の `background-color` が `transparent`、`resource` が navy ではない中立色、`domain` が navy 継続

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin kind colors (dark theme) > finds the fill-less kinds` / `builtin kind colors (light theme) > finds the fill-less kinds`

### AC-2: 塗りなし kind の枠線が唯一の輪郭として 3:1 を満たす

- [x] `usecase` の枠線が、素の canvas と**全 boundary tint 合成**に対して 3:1 以上（両テーマ）。文字は同じ面すべてに対して 4.5:1 以上

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin kind colors (dark theme) > usecase stays legible on the canvas and under every boundary tint` / `builtin kind colors (light theme) > usecase stays legible on the canvas and under every boundary tint`

### AC-3: fill ⇔ text の対が全 kind で揃い、読める（TPL-1697）

- [x] `background-color` を設定する全 bare kind ルールが対の `color` も設定する（両テーマ）。dark の deploy 9 kind は本 PR まで `color` を持たず既定の白に落ちていた

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin kind colors (dark theme) > %s pairs its fill with a text color (TPL-1697)`

- [x] 不透明な塗りを持つ kind のラベルが自分の塗りに対して 4.5:1 以上（両テーマ）

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin kind colors (dark theme) > %s keeps its label AA-legible on its own fill`

- [x] 塗る kind の数が期待どおり（片テーマから kind が落ちてもカバレッジが黙って縮まない）

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `builtin kind colors (dark theme) > finds the kind rules that paint a card`

### AC-4: deploy kind の 3 色が同一色相から導出されている

- [x] `oci` / `lambda` の解決済みスタイルが新しい低明度塗り + 高明度文字を持ち、accent（border / badge）は従来どおり

> ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `resolves oci deploy node style from builtin sheet` / `resolves lambda deploy node style from builtin sheet`

- [x] ビルトインシート上でも `oci` の 3 色が表どおり

> ✅ Automated — `packages/core/src/builtins/default-style.test.ts` › `contains correct colors for oci deploy kind`

### AC-5: 塗りを色として読む面が塗りなし kind で壊れない

- [x] `legend { ref usecase ... }` のスウォッチが `fill="transparent"`（不可視の四角）ではなく枠線色になる — 両テーマ

> ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `swatches a fill-less kind with its border color (Issue #2421)`

### AC-6: 既存 badge / edge label のコントラストが維持される

- [x] 全 badge-color が canvas に対して 4.5:1、boundary tint 合成に対して 3:1 のバックストップを維持（回帰確認）

> ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › `badge-color of %s is AA-legible on the canvas` / `badge-color of %s stays above the AA-large backstop under boundary tints`

### AC-7: 生成物とドキュメントが新しい配色に追従している

- [x] コミット済みの `docs/guide/diagrams/*.svg` が現在のビルトインシートと一致する（本 PR の配色変更では実差分ゼロ — ガイドの図に `usecase` / `resource` / deploy ノードが登場しないため）。ガードは `pnpm exec tsx scripts/guide/gen-guide-diagrams.ts --check`

> ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `the committed guide diagrams + image refs are up to date (run `pnpm gen:guide-diagrams` if this fails)`

- [x] en / ja の spec が同一の見出し構造を保つ（新設した色語彙節が両方にある）

> ✅ Automated — `scripts/lint/spec-structure-sync.test.ts` › `real repo: every en/ja spec pair has identical heading structure`

## 手動確認

自動テストは「規則を満たしているか」を測るが、「読んで気持ちよいか」は測らない。以下は実機の目視でのみ判定できる。

- [ ] **塗りなし usecase が境界の中で読める**: <https://karasu.kompiro.dev/> で boundary を持つモデルを開き、*Group by: Boundary* にする。dark / light 双方で、usecase カードの内側に frame の tint が透け、カードが境界の一員として読めること。枠線がぼやけて消えていないこと。
- [ ] **deploy カードの accent が浮いていない**: deploy ビューを dark で開き、`war` / `function` のカードで枠線・バッジ・ラベルが同じ色系統に見え、地色が茶・オリーブの濁りに見えないこと。
- [ ] **論理層の 4 kind が一目で区別できる**: domain ビューで `domain` / `usecase` / `resource` / `member` が並ぶ図を開き、色と形だけで 4 種を見分けられること。
