---
id: 0043-all-views-preview
title: Open All Views (bundled SVG in a new window)
status: active
---

# Acceptance Test: Open All Views

## Purpose

Verify that the "Open All Views" button in the preview toolbar opens
the bundled all-views SVG in a new browser tab/window, so the user can
navigate System / Deploy / Org tabs side-by-side with the main editor.

> **History**: an earlier draft of this AT described an in-app iframe
> variant that replaces the PreviewPane. That feature was not pursued;
> the shipped implementation (#301) opens the bundled SVG in a new
> window via `window.open()` with a Blob URL. This AT now describes the
> shipped behavior.

## Prerequisites

- A browser that supports CSS `:has()` (Chrome 105+, Firefox 121+, Safari 15.4+)
- A `.krs` file with at least two defined views (e.g., system + deploy)

## Test Fixture

Paste the following into the editor:

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

### Button Availability

> ✅ Automated — `packages/e2e/tests/at-0043-all-views-preview.spec.ts` › `button is visible and enabled with a project that has views`

- [ ] "⊟ Open All Views" button is visible in the preview toolbar
- [ ] Button is disabled when the editor content has no views defined
      (e.g. a syntactically empty document)
- [ ] Button is enabled when at least one view is defined

### Opening the Bundled SVG

> 🟡 Partially automated — `packages/e2e/tests/at-0043-all-views-preview.spec.ts` › `clicking the button opens a blob: popup carrying the bundled SVG`（popup 起動と blob: MIME は手動）

- [ ] Clicking the button triggers a new browser tab/window (popup)
- [ ] The popup loads a `blob:` URL that serves the bundled SVG with
      MIME type `image/svg+xml`
- [x] The rendered SVG inside the popup contains three tabs (System / Deploy / Org) and defaults to the System pane
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `tab navigation via :target — panes switch, fragment updates, active tab distinct`
- [x] Closing the popup leaves the main editor and PreviewPane untouched — the main window URL fragment is unchanged
> ✅ Automated — `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` › `tab navigation via :target — panes switch, fragment updates, active tab distinct`

### Tab Navigation Inside the Popup

> ✅ Automated by `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (suite-wide)

- [x] Clicking the Deploy tab switches to the deploy pane
- [x] Clicking the Org tab switches to the org pane
- [x] Clicking the System tab returns to the system pane
- [x] The active tab is visually distinct (asserted structurally: the active tab
      `rect` fill differs from an inactive tab; the perceptual look stays manual)

### Drill-Down Inside the Popup

> ✅ Automated by `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (suite-wide)

- [x] Clicking a node with children navigates to its drill-down level
- [x] A Back button is shown on drill-down levels
- [x] Clicking Back returns to the parent level (the paint-order fix from #2044 /
      #2051 makes the Back control clickable at the browser layer)
- [x] Navigating between drill-down levels does not affect the outer
      page URL

### Disabled Tabs

> ✅ Automated by `packages/e2e/tests/at-0041-all-views-bundled-svg.spec.ts` (suite-wide)

- [x] A view not defined in the `.krs` file shows a disabled (dimmed)
      tab in the popup (asserted via the `krs-tab--disabled` class; the dimmed
      look stays manual)
- [x] Disabled tabs cannot be clicked (no `<a>` wrapper; a click does not navigate)
