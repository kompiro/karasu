---
id: 0041-all-views-bundled-svg
title: All Views Bundled SVG
status: draft
---

# Acceptance Test: All Views Bundled SVG

## Purpose

Verify that `buildAllViewsSvg()` generates a single SVG file that bundles system, deploy, and org views with CSS-only tab navigation and per-view drill-down.

## Current Status

`buildAllViewsSvg()` is implemented in `packages/core` and integrated into the app UI: the
preview toolbar's **Open All Views** button opens the bundled SVG in a new window (AT-0043).
The browser-level tab navigation, drill-down and Back control are fenced by
`packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (driven through that popup).

The script-based generation below remains a valid manual fallback for inspecting the raw SVG.

## How to Generate the SVG

Run the following from the repository root:

```bash
npx tsx -e "
import { buildAllViewsSvg } from './packages/core/src/index.ts';
import { writeFileSync } from 'fs';

const src = \`
system ECommerce {
  service OrderService {
    label \"Order\"
    domain OrderDomain { label \"Order Domain\" }
  }
  service PaymentService { label \"Payment\" }
}

deploy Production {
  oci OrderApp { label \"Order App\" realizes OrderService }
  oci PayApp { label \"Pay App\" realizes PaymentService }
}

organization Acme {
  team Engineering {
    label \"Engineering\"
    team Backend { label \"Backend\" }
  }
}
\`;

const { svg, diagnostics } = buildAllViewsSvg(src);
writeFileSync('/tmp/all-views.svg', svg);
console.log('Generated: /tmp/all-views.svg');
if (diagnostics.length > 0) console.warn('Diagnostics:', diagnostics);
"
```

Then open the generated file in a browser:

```bash
# macOS
open /tmp/all-views.svg

# Linux
xdg-open /tmp/all-views.svg
```

> **Note:** The SVG must be opened as a file URL (e.g., `file:///tmp/all-views.svg`) for CSS `:target`
> navigation to work. Opening via a local HTTP server also works.

## Prerequisites

- Node.js with `tsx` available (`npm install` in the repo root is sufficient)
- A browser that supports CSS `:has()` (Chrome 105+, Firefox 121+, Safari 15.4+)

## Test Fixture

```krs
system ECommerce {
  service OrderService {
    label "Order"
    domain OrderDomain { label "Order Domain" }
  }
  service PaymentService { label "Payment" }
}

deploy Production {
  oci OrderApp { label "Order App" realizes OrderService }
  oci PayApp { label "Pay App" realizes PaymentService }
}

organization Acme {
  team Engineering {
    label "Engineering"
    team Backend { label "Backend" }
  }
}
```

## Checklist

### Tab Navigation

- [x] The SVG renders three tabs: **System**, **Deploy**, **Org**
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `tab bar always has three tabs`

> ✅ Automated by `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (suite-wide)

- [x] By default (no URL fragment), the **System** pane is visible
- [x] Clicking **Deploy** tab navigates to the deploy pane (URL fragment `#krs-deploy-root`)
- [x] Clicking **Org** tab navigates to the org pane (URL fragment `#krs-org-root`)
- [x] Clicking **System** tab returns to the system pane (URL fragment `#krs-system-root`)
- [x] Active tab has a visually distinct appearance（構造的に検証: active タブ `rect` の fill が非 active と異なる。知覚的な見た目は手動）

### Disabled Tabs

- [x] When a view has no content, its tab is visually disabled (dimmed)
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `system only: system tab enabled, deploy/org tabs disabled`（`krs-tab--disabled` クラス付与を検証）

- [x] Disabled tabs are not clickable (no `<a>` wrapper)
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `disabled tab (no org block) has no <a> wrapper and stays inert`
- [x] For a system-only file, Deploy and Org tabs are disabled
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `system only: system tab enabled, deploy/org tabs disabled`

> manual / visual review — タブの dimmed 見た目のみブラウザ目視。非クリック（`<a>` ラッパー不在）は e2e でフェンス済み。

### Drill-Down (System View)

- [x] Clicking a node with children navigates to its detail level (e.g., `#krs-system-OrderService`)
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `system drill-down links use krs-system-* prefix`（`#krs-system-*` アンカーと `<a href>` の生成を検証。クリック遷移そのものはブラウザ `:target`）

> ✅ Automated by `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (suite-wide)

- [x] The detail level shows a **← Back** button
- [x] Clicking Back returns to the parent level
- [x] Nested drill-down works for three levels if present（root → Store → Catalog を検証）

### Drill-Down (Org View)

- [x] Teams with sub-teams show a drill-down link
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `drill-down — node links descend levels; browser-back ascends`
- [x] Clicking a team navigates to its detail level (e.g., `#krs-org-Engineering`)
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `drill-down — node links descend levels; browser-back ascends`
- [ ] Back button returns to org root

> manual / visual review — Org view の Back（org root への復帰）はブラウザで手動確認。team ドリルダウンの link 表示と遷移は e2e でフェンス済み。

### Deploy View

- [x] Deploy view shows a single flat level with all deploy units
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `tab navigation via :target — panes switch, fragment updates, active tab distinct`（deploy ペインに store-svc / billing-svc 両ユニットが描画されることを検証）
- [x] No drill-down within the deploy view
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `deploy is a single non-drillable level`

### Empty File

- [x] A `.krs` file with no content produces a "No diagram" placeholder SVG
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `returns placeholder for empty file`

### Style Source

- [x] Passing a `styleSource` string applies custom styles to the rendered output
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `applies styleSource to the rendered output`

- [x] Parse errors in `styleSource` are returned in `diagnostics` but the SVG still renders
> ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `returns diagnostics for malformed style source`
