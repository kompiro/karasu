---
id: 0043-all-views-preview
title: In-App Preview All Views
status: draft
---

# Acceptance Test: In-App Preview All Views

## Purpose

Verify that the "Preview All Views" button in the app toolbar renders the bundled all-views SVG
in an `<iframe srcdoc>`, enabling tab navigation across system/deploy/org views without affecting
the parent page URL fragment.

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

- [ ] "Preview All Views" button is visible in the preview toolbar
- [ ] Button is disabled when the editor content is empty or parse-only (no views defined)
- [ ] Button is enabled when at least one view is defined

### Activating All Views Preview

- [ ] Clicking "Preview All Views" shows an iframe that replaces the current PreviewPane
- [ ] The DiagramTabBar (System / Deploy / Org tabs) is hidden while the iframe is shown
- [ ] The BreadcrumbBar is hidden while the iframe is shown
- [ ] The button has a visually active/highlighted state while the mode is on
- [ ] Clicking the button again exits the mode and restores the normal per-view preview

### Tab Navigation Inside the iframe

- [ ] The SVG inside the iframe shows three tabs: **System**, **Deploy**, **Org**
- [ ] By default, the System pane is visible
- [ ] Clicking the Deploy tab switches to the deploy pane
- [ ] Clicking the Org tab switches to the org pane
- [ ] Clicking the System tab returns to the system pane
- [ ] The active tab is visually distinct

### Drill-Down Inside the iframe

- [ ] Clicking a node with children navigates to its drill-down level
- [ ] A Back button is shown on drill-down levels
- [ ] Clicking Back returns to the parent level
- [ ] Navigating between drill-down levels does not affect the outer page URL

### Mutual Exclusion with Show All Layers

- [ ] Activating "Preview All Views" while "Show All Layers" is active turns off "Show All Layers"
- [ ] Activating "Show All Layers" while "Preview All Views" is active turns off "Preview All Views"

### Disabled Tabs

- [ ] A view not defined in the `.krs` file shows a disabled (dimmed) tab in the iframe
- [ ] Disabled tabs cannot be clicked
