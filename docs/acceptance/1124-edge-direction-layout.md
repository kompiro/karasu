---
type: product
---

# AT-1124: Edge `direction` hint reaches the layered layout

- **日付**: 2026-05-05
- **関連 Issue**: [#1124](https://github.com/kompiro/karasu/issues/1124)（親 #1076）
- **対象ファイル**:
  - `packages/core/src/renderer/layout.ts`（`buildGraph` / `hasCycle` / `layout` / `layoutMultipleSystems`）
  - `packages/core/src/renderer/svg-renderer.ts`（`render` で `edgeDirections` map を組み立てて伝搬）
  - `packages/core/src/renderer/layout.test.ts`、`packages/core/src/index.test.ts`
  - `docs/spec/style.md`、`docs/spec/style.ja.md`
- **関連 Design Doc**: [`docs/design/edge-direction-style.md`](../design/edge-direction-style.md)、[`docs/design/gui-driven-style-editing.md`](../design/gui-driven-style-editing.md)
- **依存**: [#1110](https://github.com/kompiro/karasu/issues/1110)、[#1111](https://github.com/kompiro/karasu/issues/1111)（edge ID selector）、[#1125](https://github.com/kompiro/karasu/pull/1125)（`direction` プロパティ）、[#1129](https://github.com/kompiro/karasu/pull/1129)（GUI 右クリックメニュー）

## 受け入れ条件

- [x] AT-A: `edge#<id> { direction: up; }` を書くと、drill-down view で source が target の **下** に配置される（layered layout がレイヤ割当を反転する）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > places source below target when an edge has direction:up` & `packages/core/src/index.test.ts` › `compile — edge direction hint reaches the layered layout > \`direction: up\` flips the source/target layer order in drill-down views`

- [x] AT-B: `direction: down` は現状の挙動と同じ（`auto` と等価で no-op）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > treats direction:down as the natural orientation (no change)`

- [x] AT-C: `direction: left` / `direction: right` は layered layout では honor されず `auto` にフォールバックする（描画結果は baseline と同じ y 座標）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > ignores direction:left / direction:right in the layered layout (parses but no-op)`

- [x] AT-D: `up` 反転がサイクルを引き起こす場合、エンジンは反転を破棄して自然な orientation でレンダリングする（クラッシュしない）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > edge direction hint > falls back to natural orientation when direction:up would create a cycle`

- [x] AT-E: トップレベル system view の forced kind-based layout（user → client → service の段組）では `direction` が無視される
  > ✅ Automated — `packages/core/src/renderer/layout.ts` で forced layer 経路に `edgeDirections` を渡していないことで仕様化、spec にも明記。`packages/core/src/renderer/layout.test.ts` の forced layout 既存テストが no-op を保証

- [ ] AT-F（manual）: 実際の Preview で edge を右クリック → Direction ▸ Up を選び、対象エッジが上下に flip して描画されることを確認する。drill-down view（service 配下の domain など）で行うこと
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`examples/getting-started/index.krs` の service 内 domain edge などに対し操作を行い、配置が変わることを目視

- [ ] AT-G（manual）: トップレベル system view で edge を右クリック → Direction ▸ Up を選んでも図が変化しないことを確認する（forced layer の挙動）。`.krs.style` には rule が増えるが描画は変わらない
  > 🧑 Manual — system view で操作し、layout が変化しないことを期待値として目視

## 補足

- **honor される範囲**: トポロジカルなレイヤ割当を行う drill-down view（service / domain など）に限定。トップレベル system view の forced kind-based layout（C4 stratification）は意図的に honor しない
- **`left` / `right` を持っている理由**: GUI / 文法側は 5 値 enum で受けるが、layered layout に横方向の自然な投影が無いので no-op。将来 layout エンジンを差し替える可能性に備え、parse は通す
- **サイクル時の挙動**: 現状 warning は出さず silent に no-op。利用実態を見て warning 追加の要否を判断する（spec に明記済み）
- spec から MVP 制約の callout は撤去済み。`direction` は parse / resolve / layout すべてに反映される正式機能になった
