---
type: acceptance-test
issue: "#1707"
feature: "Preview toolbar links to the documentation site"
date: 2026-06-23
---

# AT-1707: the app links to the documentation site from the Preview toolbar

## Overview

The app previously had no in-product path to the documentation site
(https://kompiro.github.io/karasu/). The Preview toolbar now hosts a `📖 Docs`
link that opens the docs site in a new tab. It sits next to the existing
`↗ Reference` button — the two are deliberately distinguished: `📖 Docs` is the
external documentation site, while `↗ Reference` pops out the in-app reference
for the active view.

Automated coverage: `packages/app/src/components/PreviewColumn.test.tsx`
(`Docs link` › links to the documentation site, opening in a new tab / uses the
Japanese aria-label when locale=ja).

## AC-1: the Docs link targets the docs site and opens in a new tab (automated)

**Steps:** render `PreviewColumn` and query the link named "documentation site".

**Expected:** an `<a>` with `href="https://kompiro.github.io/karasu/"`,
`target="_blank"`, and `rel="noopener noreferrer"`.

## AC-2: the label is localized (automated)

**Expected:** the aria-label is English ("Open the documentation site in a new
tab") under `locale=en` and Japanese ("ドキュメントサイトを新しいタブで開く")
under `locale=ja`. The visible label is `📖 Docs` in both.

## AC-3 (manual): the link is distinguishable from Reference and actually opens the docs

**Steps:**
1. Open the app (`https://karasu.pages.dev/` or a local `pnpm --filter @karasu-tools/app dev`).
2. Look at the Preview toolbar.
3. Click `📖 Docs`.

**Expected:** `📖 Docs` and `↗ Reference` read as two distinct actions (book vs
pop-out arrow); clicking `📖 Docs` opens https://kompiro.github.io/karasu/ in a
new browser tab, leaving the app tab intact.
