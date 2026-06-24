# .krs.style Syntax Reference

> **English** (this file) · [日本語](style.ja.md)

## Selector types

| Selector | Example | Target |
|----------|---------|--------|
| Kind | `service` | All nodes of the given kind |
| Multiple kinds | `service, domain` | All nodes of any listed kind |
| Tag | `[external]` | All nodes with the given tag |
| Annotation | `@deprecated` | All nodes with the given annotation |
| Compound (kind + tag) | `service[external]` | Matches both kind and tag |
| Compound (tag + annotation) | `[external]@deprecated` | Matches both tag and annotation |
| Compound (kind + tag + annotation) | `service[external]@deprecated` | Matches all three |
| ID | `#ECommerce` | A specific node only |
| Edge | `edge` | All edges |
| Edge + tag | `edge[async]` | Edges with the given tag |
| Edge ID | `edge#criticalWrite`, `edge#A->B`, `edge#A-->B` | A specific edge only |

---

## Specificity rules (cascade)

<!-- gen:reference:selector-specificity — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Selector | Example | Score |
|----------|---------|-------|
| Kind | `service` | 1 |
| Tag | `[external]` | 10 |
| Annotation | `@deprecated` | 10 |
| Kind + tag | `service[external]` | 11 |
| Tag + annotation | `[external]@deprecated` | 20 |
| Kind + tag + annotation | `service[external]@deprecated` | 21 |
| ID | `#ECommerce` | 100 |
| Edge | `edge` | 1 |
| Edge + tag | `edge[async]` | 11 |
| Edge ID | `edge#criticalWrite` | 101 |
<!-- /gen:reference:selector-specificity -->

`edge#criticalWrite` scores 101 = 100 for the id + 1 for the `edge` kind.
When scores are equal, the later declaration wins (same as CSS).

---

## Edge ID selector (`edge#<id>`)

Targets a single edge for surgical overrides. The `<id>` is the edge's
**canonical id**, derived after parsing:

1. If the author wrote `#<id>` on the edge in `.krs` (or on the
   `usecase` `resource` row), that author id is the canonical id.
2. Otherwise the canonical id is the **base form** `<from><arrow><to>`,
   where the arrow is `->` for sync edges and `-->` for async edges.

```css
/* Author-supplied id from `.krs`:  A -> B "primary" #criticalWrite */
edge#criticalWrite { color: #EF4444; }

/* Base form for an unauthored edge */
edge#A->B { color: #00FF00; }

/* Async base form */
edge#A-->B { stroke-width: 2px; }

/* Dot-notation node refs in the base id (e.g. usecase→resource synthesized edges) */
edge#PlaceOrder->OrderDB.OrderTable { direction: down; }
```

When two edges share the same computed base id and neither has an
author id, the parser raises an `ambiguous-edge-base` warning and the
`edge#<base>` selector matches **none** of them. To disambiguate, give
one of the edges an `#<id>` in `.krs`. See
[`docs/spec/syntax.md`](syntax.md#edge-declaration) and
[`docs/design/edge-id-selector.md`](../design/edge-id-selector.md).

### When to prefer tag selectors

For classification overrides like read vs. write, use the tag form
(`edge[write]`, `edge[read]`) rather than `edge#<id>`. Tag selectors
follow the logical classification — when a `usecase`'s `operations`
change, the matching edges follow automatically. Per-edge `edge#<id>`
overrides are best reserved for genuinely one-off styling decisions
where the identity of *that specific edge* is what matters.

---

## Property list

> Properties are separated by **`;`**. A `,` between two declarations is
> a parse error (`expected-semicolon-between-properties`); the parser
> recovers by treating the comma as a semicolon and continues with the
> next property. Commas inside a single value (e.g. `font-family: "X",
> sans-serif`) remain valid.

```css
/* Node properties */
background-color: #1D4ED8;
color:            #DBEAFE;       /* text color */
border-color:     #1E40AF;
border-width:     2px;
border-style:     solid;         /* solid | dashed | dotted */
border-radius:    8px;
font-size:        13px;
font-weight:      bold;          /* normal | bold */
font-family:      "Noto Sans JP", sans-serif;
opacity:          0.6;

/* Edge properties */
color:            #94A3B8;
stroke-width:     1.5px;
font-size:        11px;
stroke-style:     solid;         /* solid | dashed | dotted (canonical, see below) */
border-style:     solid;         /* solid | dashed | dotted (edge alias of stroke-style) */
direction:        auto;          /* up | down | left | right | auto (hint, see below) */
label-position:   middle;        /* start | middle | end | <0.0..1.0> */
label-offset:     0 0;            /* <dy>px or <dx>px <dy>px (screen-axis) */

/* karasu-specific properties (not standard CSS) */
shape:            box;           /* box | user | cylinder | queue | hexagon | cloud | url("...") */

/* Annotation properties (badge display) */
badge-color:      #EF4444;
badge-icon:       "⚠";
badge-label:      "Deprecated";
```

---

## stroke-style property (edges)

`stroke-style` is the **canonical** name for an edge's line style
(`solid | dashed | dotted`), matching the SVG-flavored `stroke-*`
vocabulary edges already use (`stroke-width`). `border-style` remains
supported on edges as an alias for backward compatibility — existing
stylesheets keep working unchanged.

```css
edge[async]  { stroke-style: dashed; }   /* preferred */
edge[legacy] { border-style: dashed; }   /* alias, same effect */
```

When **both** are declared for the same edge after the cascade,
`stroke-style` wins regardless of declaration order:

```css
edge { border-style: dotted; stroke-style: dashed; }  /* → dashed */
```

On nodes, `border-style` is the only line-style property —
`stroke-style` has no effect on node shapes.

> Related TPLs: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)
> — every property declared in this document's `css` fences must exist in
> the in-app reference data, and every `PROPERTY_SCHEMAS` entry must be
> documented here (`stroke-style` was a schema-only ghost before being
> formalized — see ADR-20260610-01 / #1492).

---

## shape property

<!-- gen:reference:shapes — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Keyword | Shape | Typical use |
|---------|-------|-------------|
| `box` | Rounded rectangle | service, domain (default) |
| `user` | Person icon (head + body) | user |
| `cylinder` | Cylinder | databases |
| `queue` | Horizontal cylinder | queues |
| `hexagon` | Hexagon | microservices |
| `cloud` | Cloud | external cloud services |
<!-- /gen:reference:shapes -->

Custom shapes (SVG file reference):

```css
service[external] {
  shape: url("shapes/cloud.svg");
}
```

---

## Layout hints (escape hatch)

> **Use as a last resort.** karasu's auto-layout (rows by kind + reachability,
> orthogonal edge routing, port distribution) handles most diagrams without
> input. A layout hint is appropriate only when the auto-layout cannot
> express the author's intent — e.g. an admin actor that must read on the
> right, or external services grouped to one side. Reach for the
> heuristics first; reach for hints last.

### `column` — `left | center | right`

Buckets a node into one of three columns within its layer. The middle
bucket merges `center` and unspecified nodes, so authors can pin only the
extremes:

```css
service[external]      { column: right; }
queue, database, storage { column: center; }
/* internal services left unspecified — they fall into the middle bucket */
```

Within each bucket, the existing within-layer order is preserved
(declaration order in system view; barycenter elsewhere). The hint does
**not** move a node to a different layer (row); for that, file an
auto-layout heuristic issue rather than reaching for a new hint.

#### External services (system view): `column` picks the side

In the system view, `[external]` services are placed in **left/right side
columns** by default (not a bottom row), so `service → external` edges run
horizontally and don't weave through the downward infra fan-out. The side is
chosen automatically from the consuming service's position (each external is
grouped to the side of the service that calls it). `column: left` / `column:
right` on an external service **overrides** that auto-assignment and pins it to
the named side:

```css
#LegacyBilling { column: left; }  /* pin this external SaaS to the left side */
```

`column: center` / unspecified on an external service leaves the side to the
auto-assignment. (infra kinds — `database` / `queue` / `storage` — stay in the
bottom row regardless of any `[external]` tag; see Tags.)

> Related TPLs: [TPL-20260624-03](../test-perspectives/TPL-20260624-03-external-side-placement-invariant.md)

### Scope

| View | Behavior |
| --- | --- |
| `system` | Honored as described above. |
| `deploy` | Ignored. A `style-column-ignored-non-system-view` warning is emitted on resolution. |
| `org`    | Ignored. Same warning. |

Invalid values (anything other than `left` / `center` / `right`) emit a
`style-column-invalid-value` warning and are dropped.

### `grid-columns` — positive integer

Sets how many columns a container's direct children wrap into. By default the
layout already wraps many siblings into a **balanced grid** so a wide sibling
set does not sprawl into one row that forces a zoom-out — keeping a view
graspable at a glance (see Concepts, scoped glance / resolution axis). The
default column count auto-balances toward a square: a small set (up to five)
stays on one row, and a larger set uses `ceil(sqrt(n))` columns, capped at five,
so it grows downward rather than sideways.

`grid-columns` overrides that default for a specific container — set it on the
node whose children you want to re-flow (the `system` for its services, a
`service` for its domains, a `domain` for its usecases, a `team` for its member
grid):

```css
#PlatformSystem { grid-columns: 3; }   /* its services wrap into 3 columns */
#BillingDomain  { grid-columns: 2; }   /* its usecases wrap into 2 columns */
```

A row still wraps early if it would exceed the maximum layer width, so an
oversized `grid-columns` cannot overflow the frame. Unlike `column` (system view
only), this hint is honored on the system and drill-down views and the org
member grid. The deploy view auto-balances its container grid as well, but it
groups containers by `realizes` target rather than by a container node, so it
has no per-container `grid-columns` override in v1.

Invalid values (anything that is not a positive integer, e.g. `0` or `2.5`) emit
a `style-grid-columns-invalid-value` warning and are dropped; the layout
auto-balances instead.

> Related TPLs: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) — limit how much is shown at once; a single view keeps a graspable resolution (the balanced grid keeps visual density bounded).

### `direction` — `auto | up | down | left | right`

A layout hint on edges. Suggests the visual direction in which the edge
should flow; default `auto` lets the layout engine decide.

```css
edge[write] { direction: down; }
edge[read]  { direction: right; }
edge#criticalWrite { direction: down; }
```

The hint travels through the resolver into `ResolvedEdgeStyle.direction`
and is consumed by both the GUI editing flow (#1076 / #1098) and the
karasu layered layout.

#### Honored values

- **`auto`** (default): no bias; the engine is free to choose.
- **`up`**: place the source *below* the target so the visual arrow
  flows upward. Implemented by reversing the edge in the topological
  layer assignment, or — under the forced kind-based system view — by
  pushing the source one layer below the target. The visual
  `from -> to` orientation of the arrow itself is unchanged.
- **`down`**: place the source *above* the target so the visual arrow
  flows downward, even when other constraints (e.g. a back-edge in the
  forced kind-based layout) would otherwise route it the other way.
  Mirrors `up`: under the forced kind-based layout the source is
  pushed one layer above the target, leaving the target and other
  same-kind nodes in place. No-op when the target is already at
  layer 0 (no room to push the source above the topmost row) — falls
  back to the natural orientation. In drill-down views without forced
  layers the natural topological order already satisfies `down`, so it
  is observationally identical to `auto` there.
- **`left` / `right`**: orient the visual arrow leftward / rightward,
  mirroring the way `up` / `down` name the arrow flow. The source
  endpoint lands on the **opposite** side of the target from the
  arrowhead — `direction: right` puts the source on the *left* of the
  target so the arrow ends up flowing rightward; `direction: left`
  mirrors. When the natural layered layout puts source and target in
  different rows (the common case for service-to-service edges), the
  engine **pulls the source into the target's layer first**, then runs
  the within-layer reorder. The reorder pass runs after
  `bucketByColumn` so it overrides node `column` placement for the
  source endpoint; the target's `column` stays in effect. Conflicts on
  the same source resolve **last-wins**, matching the cascade
  convention. See
  [`docs/design/edge-direction-horizontal.md`](../design/edge-direction-horizontal.md).

#### Cycle / forced-layer fallback

`up` is a hint, not a constraint. The engine drops the reversal in two
cases:

- **Cycle guard.** If applying `up` would close a cycle in the layer
  DAG, the engine ignores the reversals for the affected edges and
  renders with the natural orientation.
- **Forced kind-based layouts.** The top-level system view stratifies
  nodes by kind (`user → client → service → ...`). `direction: up` is
  honored by *moving the source one layer below the target*; the
  target itself stays in its kind row, and other nodes of the same
  kind are unaffected. The kind stratification is therefore only
  perturbed for the explicitly-flagged edge.

See [`docs/design/edge-direction-style.md`](../design/edge-direction-style.md)
for the rationale.

Invalid values are silently dropped and `direction` falls back to `auto`.

### `label-position` — `start | middle | end | <0.0..1.0>`

Where along the edge the label anchor sits. Default `middle` (= `0.5`).

```css
edge[delivers] { label-position: start; }   /* near the source end */
edge[implicit] { label-position: end; }     /* near the target end */
edge#criticalWrite { label-position: 0.25; }
```

The renderer keeps the historical "longest-segment midpoint" heuristic
when the value is the default (`0.5`) and `label-offset` is `0`, so
existing diagrams stay byte-stable. As soon as the author sets either
property, the anchor is computed by walking the edge polyline and
landing at `position × totalLength`.

Invalid values (unknown keywords, non-numeric strings) silently fall
back to `middle`. Fractional values outside `[0, 1]` are clamped.

### `label-offset` — `<dy>px` or `<dx>px <dy>px`

Screen-axis nudge of the label relative to its computed anchor, in
pixels. CSS-shorthand parsing:

- **One value** (`label-offset: 8px`) → `dx = 0`, `dy = 8`. The most
  common "shift labels downward" case
- **Two values** (`label-offset: 4px 8px`) → `dx = 4`, `dy = 8`

```css
edge { label-offset: 0 8px; }    /* every label drops 8px below its anchor */
edge#wide { label-offset: 4px 8px; }
```

Screen axis (not edge-perpendicular) so a global rule applies a uniform
visual shift regardless of each edge's slope. Positive values shift
right (x) and down (y); negative values shift left and up.

The offset is independent of the existing `-6px` typographic lift the
renderer applies above the anchor — the lift stays in place to keep
labels off the line, and the offset adds on top.

> **Earlier draft (rejected)**: an earlier iteration of this property
> defined `label-offset` as a 1-axis perpendicular nudge relative to
> the edge direction. That made `edge { label-offset: 8px; }` produce
> a different visual direction per edge slope, which was hard to
> reason about. Switched to screen-axis CSS-shorthand semantics — see
> [ADR-20260509-05](../adr/20260509-05-edge-label-position-offset.md).

---

## @import scope and conflicts

- Global scope (applies to the entire file).
- When the same selector is defined in multiple files, the last one wins.
- A warning is emitted on conflict (not an error).

```
⚠ Warning: Selector "service" is defined in multiple files
  - default.krs.style:3
  - my-theme.krs.style:2
  The definition in my-theme.krs.style is applied (last wins)
```

---

## Style resolution pseudo-code

```javascript
function resolveStyle(node, rules) {
  return rules
    .filter(rule => matches(node, rule.selector))
    .sort((a, b) => specificity(a.selector) - specificity(b.selector))
    .reduce((acc, rule) => ({ ...acc, ...rule.style }), {})
}

function specificity(selector) {
  let score = 0
  if (selector.id)              score += 100
  score += selector.tags.length        * 10
  score += selector.annotations.length * 10
  if (selector.type)            score += 1
  return score
}
```

---

## Full example (default.krs.style)

```css
/* ── Kind selectors ── */
user {
  background-color: #1D4ED8;
  color:            #DBEAFE;
  border-color:     #1E40AF;
  border-width:     2px;
  border-radius:    8px;
  font-size:        13px;
  font-weight:      bold;
  shape:            user;
}

service {
  background-color: #0369A1;
  color:            #E0F2FE;
  border-color:     #075985;
  border-width:     2px;
  border-radius:    8px;
  font-size:        13px;
  font-weight:      bold;
  shape:            box;
}

domain {
  background-color: #15803D;
  color:            #D1FAE5;
  border-color:     #166534;
  shape:            box;
}

usecase {
  background-color: #1F2937;
  color:            #F9FAFB;
  border-color:     #374151;
  font-size:        11px;
  shape:            box;
}

impl {
  background-color: #78350F;
  color:            #FEF3C7;
  border-color:     #92400E;
  shape:            box;
}

/* ── Tag selectors ── */
[external] {
  background-color: #1F2937;
  color:            #D1D5DB;
  border-color:     #374151;
  border-style:     dashed;
}

/* ── Annotation selectors ── */
@deprecated {
  badge-color:  #EF4444;
  badge-icon:   "⚠";
  badge-label:  "Deprecated";
  opacity:      0.6;
}

@new {
  badge-color:  #10B981;
  badge-icon:   "✦";
  badge-label:  "NEW";
}

@experimental {
  badge-color:  #F59E0B;
  badge-icon:   "⚗";
  badge-label:  "Experimental";
}

@migration_target {
  badge-color:  #3B82F6;
  badge-icon:   "→";
  badge-label:  "Migration target";
}

/* ── Compound selectors ── */
user[external] {
  color: #9CA3AF;
}

[external]@deprecated {
  border-color: #EF4444;
}

/* ── ID selectors ── */
#ECommerce {
  background-color: #7C3AED;
}

/* ── Edges ── */
edge {
  color:        #94A3B8;
  stroke-width: 1.5px;
  font-size:    11px;
}

edge[async] {
  border-style: dashed;
  color:        #6B7280;
}

/* ── Organization diagram (Org Tree View) ── */
team {
  background-color: #1E3A5F;
  color:            #E2E8F0;
  border-color:     #3B82F6;
}

member {
  background-color: #0F172A;
  border-color:     #334155;
}

/* Highlight a specific team */
#BackendTeam {
  border-color: #F59E0B;
  border-width: 2px;
}
```

---

## Organization diagram node selectors (Org Tree View)

The Org Tree View supports `team` / `member` kind selectors and ID selectors (`#NodeId`).

| Selector | Target |
|----------|--------|
| `team` | All team cards |
| `member` | All member cards |
| `#TeamId` | A specific team card |
| `#MemberId` | A specific member card |
| `edge` | Bézier connectors between teams |

**Supported properties:**

| Property | Effect |
|----------|--------|
| `background-color` | Card background color |
| `color` | Text color |
| `border-color` | Border color |
| `border-width` | Border width (px) |
| `border-radius` | Border radius (px) |
| `font-size` | Font size (px) |
| `font-weight` | Font weight (`normal` / `bold`) |
| `font-family` | Font family |

> **Note**: `opacity` / `shape` / `badge-*` are ignored in the Org Tree View.
> Tag/annotation compound selectors (`team[external]`, etc.) are not supported at this time.
