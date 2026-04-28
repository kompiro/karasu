---
id: "0035"
title: SVG Rendering Pipeline Consolidation
issue: "#190"
date: 2026-04-01
---

## Purpose

Verify that shared text-measurement constants are centralised in `rendering-constants.ts`
and that the org-renderer icon cards use the shared `renderIconCard()` helper from `svg-builder.ts`,
without any visible change to rendered output.

## Verification commands

Run from the worktree root:

```
npm run test --workspace=packages/core  # 27 files, 464 tests
npm run typecheck --workspace=packages/core
npm run lint
npm run format:check
```

## 受け入れ条件

### AC-1: ソース構造の確認

- [ ] `packages/core/src/renderer/rendering-constants.ts` exists and exports `CHAR_WIDTH`, `NODE_PADDING_X`, `NODE_PADDING_Y`, `ICON_LABEL_CHAR_WIDTH`, `ICON_DESC_CHAR_WIDTH`, `ICON_DESC_MAX_WIDTH`
- [ ] `layout.ts` and `deploy-layout.ts` no longer define `CHAR_WIDTH`, `NODE_PADDING_X`, `NODE_PADDING_Y` locally
- [ ] `svg-renderer.ts` and `org-renderer.ts` no longer define `ICON_LABEL_CHAR_WIDTH`, `ICON_DESC_CHAR_WIDTH`, `ICON_DESC_MAX_WIDTH` locally
- [ ] `renderTeamIconCard` and `renderMemberIconCard` in `org-renderer.ts` call `renderIconCard()` from `svg-builder.ts`

> manual / visual review — AC-1 はソースファイル構造の不変条件で、`pnpm typecheck` の通過と既存 renderer/layout テスト（464 件）が間接保証する。直接的な存在／参照チェックは行わず、リファクタの完了確認は手動 grep または PR レビューで行う。

### AC-2: レンダリング結果の不変

- [ ] Open the app (`npm run dev`) and load an org diagram — visual output is unchanged
- [ ] Load a system diagram — visual output is unchanged
- [ ] Load a deploy diagram — visual output is unchanged

> manual / visual review — AC-2 は視覚的同一性の確認で、ブラウザでの描画結果を目視比較する必要があるため人間／AI レビューに残す。
