# Acceptance Test: Full View Toggle (#147)

## Summary

Verify that the Full View toggle renders a multi-level SVG in an iframe showing all drill-down levels simultaneously (vertically stacked and scrollable), without requiring interactive drill-down in the normal preview pane.

---

## Prerequisites

- The app is running (`npm run dev` in `.worktrees/full-view-drilldown`)
- A `.krs` file with at least 2 levels of nesting is loaded (e.g., the built-in sample)

---

## Test Cases

### 1. Full View button visibility

| Step | Action                                  | Expected Result                                        |
| ---- | --------------------------------------- | ------------------------------------------------------ |
| 1.1  | Open the app with the System tab active | "⊞ Full View" button is visible in the toolbar         |
| 1.2  | Switch to the Org tab                   | "⊞ Full View" button is visible in the toolbar         |
| 1.3  | Switch to the Deploy tab                | "⊞ Full View" button is **not** visible in the toolbar |
| 1.4  | Switch back to System tab               | "⊞ Full View" button reappears                         |

### 2. Entering Full View mode

| Step | Action                                      | Expected Result                                                                                                |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 2.1  | With System tab active, click "⊞ Full View" | The normal preview pane is replaced by an iframe                                                               |
| 2.2  | Observe the iframe content                  | The multi-level SVG is displayed; **all levels are visible simultaneously**, stacked vertically and scrollable |
| 2.3  | Observe the breadcrumb bar in the normal UI | The breadcrumb bar is hidden (not rendered outside the iframe)                                                 |
| 2.4  | Observe the Full View button                | Button appears highlighted/active (`.active` class applied)                                                    |

### 3. Multi-level layout in Full View iframe

| Step | Action                                    | Expected Result                                                                   |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| 3.1  | Observe the iframe content                | All drill-down levels are rendered as separate sections stacked vertically        |
| 3.2  | Observe each level's breadcrumb bar       | Each section has a breadcrumb bar showing its ancestry (e.g., Root › ServiceName) |
| 3.3  | Click a breadcrumb link inside the iframe | The view scrolls to the linked ancestor level (hash navigation)                   |
| 3.4  | Observe the browser URL bar               | It does not change — hash navigation is iframe-internal                           |

### 4. Exiting Full View mode

| Step | Action                                       | Expected Result                                               |
| ---- | -------------------------------------------- | ------------------------------------------------------------- |
| 4.1  | Click "⊞ Full View" again while in Full View | The iframe is replaced by the normal interactive preview pane |
| 4.2  | Observe the toolbar                          | Full View button is no longer highlighted                     |
| 4.3  | Observe the breadcrumb bar                   | The breadcrumb bar reappears                                  |
| 4.4  | Drill down in the normal view                | Normal single-level drill-down works as before                |

### 5. Deploy view does not support Full View

| Step | Action                    | Expected Result                                                                                         |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| 5.1  | Switch to the Deploy tab  | Full View button is absent                                                                              |
| 5.2  | Switch back to System tab | Full View state is **preserved** — if it was on before switching, the iframe is shown again immediately |

### 6. Org view Full View

| Step | Action                                         | Expected Result                                    |
| ---- | ---------------------------------------------- | -------------------------------------------------- |
| 6.1  | With Org tab active, click "⊞ Full View"       | An iframe is shown with the multi-level org SVG    |
| 6.2  | If the org has nested teams, click a team node | View navigates to sub-team level within the iframe |

### 7. Diagrams with a single level (no children)

| Step | Action                                        | Expected Result                                                               |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| 7.1  | Load a flat diagram (all services are leaves) | Full View button is still shown                                               |
| 7.2  | Click "⊞ Full View"                           | An iframe is shown with a single-level SVG (only root level, no child levels) |
| 7.3  | Observe the root level                        | Diagram is displayed normally; no drillable node links are present            |

### 8. Export SVG in Full View mode

| Step | Action                              | Expected Result                                                                                                                                                        |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Enter Full View mode                | Iframe is displayed                                                                                                                                                    |
| 8.2  | Click "↓ Export SVG" in the toolbar | A file is downloaded                                                                                                                                                   |
| 8.3  | Open the downloaded file            | The multi-level SVG is correct; it contains all level groups (`.krs-level` class, vertically stacked), breadcrumb anchor links, and SVG breadcrumb bars for each level |

---

## Pass Criteria

All test cases above pass without errors, layout breaks, or unexpected navigation behavior.
