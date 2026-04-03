# Design: Unify Drill-Down Collection Logic via Adapter Pattern

Refs #226, #192

## Purpose

`drill-down-svg.ts` contains four structurally identical collection functions that differ only in view-specific operations:

| Function | View | Mode |
|---|---|---|
| `collectDrillDownLevels` | system | drill-down |
| `collectDrillDownOrgLevels` | org | drill-down |
| `collectFullViewLevels` | system | full-view |
| `collectOrgFullViewLevels` | org | full-view |

Each pair (system/org) shares the same recursive traversal pattern but operates on different data types (`KrsNode[]` vs `OrganizationBlock[]`). This design doc defines an adapter interface to consolidate the four functions into two generic ones.

## Current Duplication Analysis

The shared algorithmic skeleton for drill-down:

```
1. Extract a view slice from the source at the given path
2. Check if the slice has content (early return if not)
3. Identify drillable children and build childLevelLinks map
4. Render the slice to SVG
5. Extract SVG parts (viewBox, innerContent)
6. Add back button if not root
7. Wrap in <g id="krs-view-..."> and push to levels
8. Recurse for each drillable child
```

The full-view collector follows a similar pattern without steps 3, 6, 7 (no navigation chrome).

### Extension Points (Where System and Org Differ)

| # | Operation | System | Org |
|---|-----------|--------|-----|
| 1 | Extract slice | `extractView(systems, path)` → `ViewSlice` | `extractOrgView(organizations, path)` → `OrgViewSlice` |
| 2 | Has content? | `childNodes.length > 0 \|\| containerNode !== null` | `focusedTeam !== null \|\| teams.length > 0` |
| 3 | Get children | `viewSlice.childNodes` | `focusedTeam?.teams ?? slice.teams` |
| 4 | Is drillable? | `child.children.length > 0` | `team.teams.length > 0 \|\| team.members.length > 0` |
| 5 | Get child ID | `child.id` | `team.id` |
| 6 | Get child label | `child.label ?? child.id` | `team.label ?? team.id` |
| 7 | Render | `render(slice, styles, undefined, ownerIndex, displayMode, childLevelLinks?)` | `renderOrgView(slice, styles, displayMode, childLevelLinks?)` |

Note: Both `render()` and `renderOrgView()` accept `childLevelLinks` as an optional parameter. When provided, drillable nodes are wrapped in `<a href="#krs-view-...">` links. When omitted, nodes render without links. The same function serves both drill-down and full-view modes.

## Proposed Design: `DrillDownAdapter<TSource, TSlice, TChild>` Interface

```typescript
interface DrillDownAdapter<TSource, TSlice, TChild> {
  /** Extract a view slice from the source at the given drill-down path */
  extractSlice(source: TSource, path: string[]): TSlice;

  /** Check if the slice has renderable content */
  hasContent(slice: TSlice): boolean;

  /** Get the list of child items from a slice */
  getChildren(slice: TSlice): TChild[];

  /** Check if a child has further levels to drill into */
  isDrillable(child: TChild): boolean;

  /** Get the unique ID of a child (used for path construction and view IDs) */
  childId(child: TChild): string;

  /** Get the display label of a child (used for full-view section headers) */
  childLabel(child: TChild): string;

  /** Render the slice as SVG. When childLevelLinks is provided, drillable nodes
   *  are wrapped in <a> tags for drill-down navigation. */
  render(slice: TSlice, childLevelLinks?: Map<string, string>): string;
}
```

### Generic Collector Functions

The four current functions collapse into two:

```typescript
function collectDrillDownLevelsGeneric<TSource, TSlice, TChild>(
  adapter: DrillDownAdapter<TSource, TSlice, TChild>,
  source: TSource,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
): void;

function collectFullViewLevelsGeneric<TSource, TSlice, TChild>(
  adapter: DrillDownAdapter<TSource, TSlice, TChild>,
  source: TSource,
  path: string[],
  pathLabels: string[],
  levels: FullViewLevel[],
): void;
```

### Adapter Implementations

**System adapter** — captures `systems`, `ownerIndex`, `styles`, `displayMode` via closure:

```typescript
function createSystemAdapter(
  systems: KrsNode[],
  ownerIndex: Map<string, string>,
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
): DrillDownAdapter<KrsNode[], ViewSlice, KrsNode> {
  return {
    extractSlice: (source, path) => extractView(source, path),
    hasContent: (slice) => slice.childNodes.length > 0 || slice.containerNode !== null,
    getChildren: (slice) => slice.childNodes,
    isDrillable: (child) => child.children.length > 0,
    childId: (child) => child.id,
    childLabel: (child) => child.label ?? child.id,
    render: (slice, links) => render(slice, styles, undefined, ownerIndex, displayMode, links),
  };
}
```

**Org adapter** — captures `organizations`, `styles`, `displayMode` via closure:

```typescript
function createOrgAdapter(
  organizations: OrganizationBlock[],
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
): DrillDownAdapter<OrganizationBlock[], OrgViewSlice, TeamNode> {
  return {
    extractSlice: (source, path) => extractOrgView(source, path),
    hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
    getChildren: (slice) => slice.focusedTeam !== null ? slice.focusedTeam.teams : slice.teams,
    isDrillable: (t) => t.teams.length > 0 || t.members.length > 0,
    childId: (t) => t.id,
    childLabel: (t) => t.label ?? t.id,
    render: (slice, links) => renderOrgView(slice, styles, displayMode, links),
  };
}
```

## Alternatives Considered

### A. Union type + runtime branching

Use `KrsNode[] | OrganizationBlock[]` as input and branch on runtime checks. Rejected: introduces runtime type checking and loses static type safety.

### B. `HierarchyNode` structural interface on AST types

Make `KrsNode` and `TeamNode` both implement a shared `HierarchyNode` interface. Rejected: forces AST types to conform to renderer concerns, and the slice structures (`ViewSlice` vs `OrgViewSlice`) are too different to unify at the type level.

### C. Higher-order functions (callbacks without interface)

Pass individual callback functions instead of an adapter object. Viable but less discoverable — the adapter interface groups related operations clearly and is easier to test.

## Scope

- Introduce `DrillDownAdapter` interface and generic collector functions
- Implement system and org adapters
- Replace all four collector functions with generic versions
- **No changes** to public API (`buildDrillDownSvg`, `buildFullViewSvg`, etc.)
- **No changes** to AST types, view extraction, or rendering logic

## Risks

- **Over-abstraction**: The adapter interface has 7 methods. This is the minimum needed to cover all extension points. If it grows beyond this, reconsider.
- **Debugging indirection**: Stack traces will show generic function names. Mitigate by keeping adapter factory functions named and simple.
