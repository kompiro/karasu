---
type: acceptance-test
issue: "#1707"
feature: "Preview toolbar Docs dropdown links to the documentation site"
date: 2026-06-23
---

# AT-1707: the app links to the documentation site from the Preview toolbar

## Overview

The app previously had no in-product path to the documentation site
(https://kompiro.github.io/karasu/). The Preview toolbar now hosts a `📖 Docs`
dropdown that groups the two documentation links: the in-app **Reference**
pop-out for the active view, and the external **Documentation site** (opened in
a new tab). Grouping them keeps the toolbar compact and reflects that both point
at documentation.

Automated coverage: `packages/app/src/components/PreviewColumn.test.tsx`
(`Docs dropdown` › groups the Reference and documentation-site links under a Docs
menu / opens the in-app reference when the Reference item is selected / uses the
Japanese trigger label and site item when locale=ja).

## AC-1: the docs-site item targets the site and opens in a new tab (automated)

**Steps:** render `PreviewColumn`, open the `📖 Docs` menu, query the
"documentation site" item.

**Expected:** an `<a>` menu item with `target="_blank"` and
`rel="noopener noreferrer"`. The `href` follows the active app locale —
`https://kompiro.github.io/karasu/` under `en`, and
`https://kompiro.github.io/karasu/ja/` under `ja` (Starlight serves the
Japanese docs under the `/ja/` locale prefix).

## AC-2: the Reference item still pops out the in-app reference (automated)

**Steps:** open the `📖 Docs` menu and select the Reference item with
`activeView=deploy`.

**Expected:** `window.open` is called once with a URL containing `reference=1`
and `view=deploy`.

## AC-3: the labels are localized (automated)

**Expected:** the trigger reads `📖 Docs` with aria-label "Documentation links"
(en) / "ドキュメントリンク" (ja); the site item reads "↗ Documentation site" (en)
/ "↗ ドキュメントサイト" (ja).

## AC-4 (manual): the dropdown reads well and actually opens the docs

**Steps:**
1. Open the app (`https://karasu.pages.dev/` or a local `pnpm --filter @karasu-tools/app dev`).
2. Click `📖 Docs` in the Preview toolbar.
3. Click **Documentation site**.

**Expected:** the menu lists **Reference** and **Documentation site** as two
clear entries; clicking **Documentation site** opens
https://kompiro.github.io/karasu/ in a new browser tab, leaving the app tab
intact; clicking **Reference** still pops out the in-app reference window.
