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

## Automated Checks

Run from the worktree root:

```
npm run test --workspace=packages/core  # 27 files, 464 tests
npm run typecheck --workspace=packages/core
npm run lint
npm run format:check
```

## Manual Verification Checklist

- [ ] `packages/core/src/renderer/rendering-constants.ts` exists and exports `CHAR_WIDTH`, `NODE_PADDING_X`, `NODE_PADDING_Y`, `ICON_LABEL_CHAR_WIDTH`, `ICON_DESC_CHAR_WIDTH`, `ICON_DESC_MAX_WIDTH`
- [ ] `layout.ts` and `deploy-layout.ts` no longer define `CHAR_WIDTH`, `NODE_PADDING_X`, `NODE_PADDING_Y` locally
- [ ] `svg-renderer.ts` and `org-renderer.ts` no longer define `ICON_LABEL_CHAR_WIDTH`, `ICON_DESC_CHAR_WIDTH`, `ICON_DESC_MAX_WIDTH` locally
- [ ] `renderTeamIconCard` and `renderMemberIconCard` in `org-renderer.ts` call `renderIconCard()` from `svg-builder.ts`
- [ ] Open the app (`npm run dev`) and load an org diagram — visual output is unchanged
- [ ] Load a system diagram — visual output is unchanged
- [ ] Load a deploy diagram — visual output is unchanged
