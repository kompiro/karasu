# Acceptance Test: Clean Drill-Down Replace (fix #182)

## Summary

Verify that drilling down into a child hierarchy displays only the focused container and its
children, without ghost ancestor containers overlapping the view. The child level should replace
the parent view cleanly in interactive mode, and be positioned independently below the parent
level in Full View mode.

---

## Prerequisites

- The app is running (`npm run dev`)
- A `.krs` file with at least 2 levels of nesting is loaded (e.g., system → service → domain)

---

## Test Cases

### 1. Interactive drill-down — service level

| Step | Action | Expected Result |
|------|--------|----------------|
| 1.1 | Open a `.krs` file with services that contain domains | System view shows service nodes |
| 1.2 | Click a service node that has domain children | View drills down to service level |
| 1.3 | Observe the diagram | Only the clicked **service container** and its **domain nodes** are shown — **no ghost ancestor boxes** (e.g., no semi-transparent system container surrounding everything) |
| 1.4 | Observe the breadcrumb bar | Breadcrumb shows ancestry (e.g., "SystemName › ServiceName") for context |

### 2. Interactive drill-down — domain level

| Step | Action | Expected Result |
|------|--------|----------------|
| 2.1 | From service level, click a domain node that has usecase children | View drills down to domain level |
| 2.2 | Observe the diagram | Only the clicked **domain container** and its **usecase nodes** are shown — **no ghost ancestor boxes** (no service ghost, no system ghost) |
| 2.3 | Observe the breadcrumb bar | Breadcrumb shows full ancestry (e.g., "SystemName › ServiceName › DomainName") |

### 3. Full View — each level independent

| Step | Action | Expected Result |
|------|--------|----------------|
| 3.1 | Enable Full View toggle | Multi-level SVG is shown in the iframe |
| 3.2 | Scroll through all levels | Each level shows **only** its focused container and child nodes — no ghost ancestor containers |
| 3.3 | Observe level boundaries | Levels are clearly separated with breadcrumb bars; no visual overlap between levels |

### 4. Ghost users are still shown (regression check)

| Step | Action | Expected Result |
|------|--------|----------------|
| 4.1 | In a `.krs` file where a `user` node connects to a service, drill into that service | The service's domain nodes appear inside the service container |
| 4.2 | Observe user nodes | The connected `user` node appears as a ghost to the **left** of the service container (this is the intended ghost-user context) |
| 4.3 | Verify no system ancestor box | No semi-transparent system container surrounds the entire diagram |

### 5. Breadcrumb navigation still works

| Step | Action | Expected Result |
|------|--------|----------------|
| 5.1 | Drill down 2 levels (e.g., system → service → domain) | Breadcrumb shows "SystemName › ServiceName › DomainName" |
| 5.2 | Click the service name in the breadcrumb | View navigates back to service level |
| 5.3 | Click the system name in the breadcrumb | View navigates back to system level |
