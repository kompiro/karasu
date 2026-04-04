---
id: 0041-all-views-bundled-svg
title: All Views Bundled SVG
status: draft
---

# Acceptance Test: All Views Bundled SVG

## Purpose

Verify that `buildAllViewsSvg()` generates a single SVG file that bundles system, deploy, and org views with CSS-only tab navigation and per-view drill-down.

## Current Status

`buildAllViewsSvg()` is implemented in `packages/core` but is **not yet integrated into the app UI or CLI**.
There is no export button or `--all-views` flag yet (depends on issue #121).

Manual verification must be done by generating the SVG via a script and opening it in a browser directly.

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

- [ ] The SVG renders three tabs: **System**, **Deploy**, **Org**
- [ ] By default (no URL fragment), the **System** pane is visible
- [ ] Clicking **Deploy** tab navigates to the deploy pane (URL fragment `#krs-deploy-root`)
- [ ] Clicking **Org** tab navigates to the org pane (URL fragment `#krs-org-root`)
- [ ] Clicking **System** tab returns to the system pane (URL fragment `#krs-system-root`)
- [ ] Active tab has a visually distinct appearance

### Disabled Tabs

- [ ] When a view has no content, its tab is visually disabled (dimmed)
- [ ] Disabled tabs are not clickable (no `<a>` wrapper)
- [ ] For a system-only file, Deploy and Org tabs are disabled

### Drill-Down (System View)

- [ ] Clicking a node with children navigates to its detail level (e.g., `#krs-system-OrderService`)
- [ ] The detail level shows a **← Back** button
- [ ] Clicking Back returns to the parent level
- [ ] Nested drill-down works for three levels if present

### Drill-Down (Org View)

- [ ] Teams with sub-teams show a drill-down link
- [ ] Clicking a team navigates to its detail level (e.g., `#krs-org-Engineering`)
- [ ] Back button returns to org root

### Deploy View

- [ ] Deploy view shows a single flat level with all deploy units
- [ ] No drill-down within the deploy view

### Empty File

- [ ] A `.krs` file with no content produces a "No diagram" placeholder SVG

### Style Source

- [ ] Passing a `styleSource` string applies custom styles to the rendered output
- [ ] Parse errors in `styleSource` are returned in `diagnostics` but the SVG still renders
