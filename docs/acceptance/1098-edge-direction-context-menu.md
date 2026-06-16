---
type: product
---

# AT-1098: Edge direction context menu (GUI MVP)

- **日付**: 2026-05-05
- **関連 Issue**: [#1098](https://github.com/kompiro/karasu/issues/1098)（親 #1076）
- **対象ファイル**:
  - `packages/core/src/renderer/layout-types.ts`、`packages/core/src/renderer/layout.ts`
  - `packages/core/src/renderer/edge-routing.ts`
  - `packages/app/src/components/PreviewPane.tsx`、`packages/app/src/components/EdgeContextMenu.tsx`
  - `packages/app/src/components/PreviewColumn.tsx`、`packages/app/src/components/AppShell.tsx`
  - `packages/app/src/state/preview-context.tsx`
  - `packages/app/src/lib/append-style-rule.ts`
  - `packages/app/src/styles/app.css`
- **関連 Design Doc**: [`docs/design/gui-driven-style-editing.md`](../design/gui-driven-style-editing.md)、[`docs/design/edge-direction-style.md`](../design/edge-direction-style.md)
- **依存**: [#1110](https://github.com/kompiro/karasu/issues/1110)、[#1111](https://github.com/kompiro/karasu/issues/1111)（edge author ID + canonical ID）、[#1125](https://github.com/kompiro/karasu/pull/1125)（`direction` プロパティ）
- **フォロー**: [#1124](https://github.com/kompiro/karasu/issues/1124)（layout エンジンが `direction` を honor する作業）

## 受け入れ条件

- [x] AT-A: SVG レンダラがエッジ要素に `data-edge-canonical-id` と `data-edge-kind` を emit する（base ID 形式と author ID 形式の両方）
  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `diff state attributes › emits data-edge-canonical-id ...` ×2

- [x] AT-B: Preview コンテナで edge を右クリックすると、その edge の `from → to` 表示と canonical id を持つコンテキストメニューが開く
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › opens the menu on right-click of an edge group with a canonical id`

- [x] AT-C: edge 以外（ノード等）を右クリックしてもコンテキストメニューは開かない
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › does not open the menu on right-click outside an edge`

- [x] AT-D: メニューから direction 値を選択すると、`onPickEdgeDirection(canonicalId, direction)` コールバックが正しい引数で呼ばれる
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › calls onPickEdgeDirection when a direction is chosen`

- [x] AT-E: `.krs.style` の import が無いとき、メニューの direction 項目は disabled になり、`@import` を追加するよう促すヒントが表示される
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › disables the direction items when no styleTargetPath is set`

- [x] AT-F: `appendEdgeDirectionRule` が既存ファイルを書き換えず、末尾に `edge#<id> { direction: <value>; }` を append する
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `appendEdgeDirectionRule › appends to an existing file without disturbing prior content`

- [x] AT-G: `.krs.style` ファイルが存在しない場合、`appendEdgeDirectionRule` が新規作成して 1 ルールだけ書く
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `appendEdgeDirectionRule › creates the file with the rule when it does not exist`

- [x] AT-H: 末尾改行が無い既存ファイルに append すると、間に改行を 1 つ挟んで新ルールを書く（diff が 1 行追加で済む）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `appendEdgeDirectionRule › inserts a separator newline ...`

- [x] AT-I: `.krs` の `@import` が複数あるとき、append 先は **最後** の import（cascade-tail）になる
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `resolveStyleAppendTarget › returns the last @import when multiple are present`

- [x] AT-J: 右クリック可能な edge は SVG 上で `class="krs-edge krs-edge--interactive"` を持ち、視覚的に区別できる透明 hitline（stroke 14px）を背面に持つ
  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `diff state attributes › marks edges with a canonical id as interactive and emits a wide transparent hitline`

- [ ] AT-K（manual）: 実際の Preview で edge を右クリック → Direction ▸ Down を選び、`.krs.style` に rule が増えていることをエディタ側で確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview を起動。`examples/ja/getting-started/index.krs` を開き、いずれかの edge を右クリックして direction を選択 → `.krs.style` のテキストが更新されることを目視

- [ ] AT-L（manual）: edge の上にマウスを乗せるとカーソルが `context-menu` に変わり、stroke が太く・明るくなる（hover フィードバック）。1.5px の細い edge でも 14px 幅の透明 hitline で右クリックが容易に当たる
  > 🧑 Manual — Preview 上で edge を狙う動作を試し、ヒット範囲とカーソル変化を目視

- [ ] AT-M（manual）: direction を選んだ後の Preview がレイアウト的に変化しないことを確認する（layout エンジンが `direction` を honor しないという MVP の仕様）。`.krs.style` 上に rule が増えるが図は同じであることを確認
  > 🧑 Manual — レイアウト変化が起きないことを期待値として目視。これは #1124 の作業範囲

## 補足

- 設計どおり **MVP では layout エンジンは `direction` を honor しない**。ユーザーから見ると「メニューを選ぶと style ファイルが書き換わる」だけで、図そのものは変わらない。これは spec の MVP 制約として `docs/spec/style.md` に明記済み（#1124 で解消予定）
- canonical ID は parse 後に確定する。base 衝突で `canonicalId` がクリアされた edge は SVG attr が空になるため、コンテキストメニュー自体が開かない（AT-B の前提）
- 書き戻し方針は `docs/design/gui-driven-style-editing.md` に従い、**append-only の cascade override**（既存ルールには触れない、より specificity の高い rule を最後に追記）
