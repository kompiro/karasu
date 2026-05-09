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

| Selector | Score |
|----------|-------|
| Kind (`service`) | 1 |
| Tag (`[external]`) | 10 |
| Annotation (`@deprecated`) | 10 |
| Kind + tag (`service[external]`) | 11 |
| Tag + annotation (`[external]@deprecated`) | 20 |
| Kind + tag + annotation | 21 |
| ID (`#ECommerce`) | 100 |
| Edge ID (`edge#criticalWrite`) | 101 (100 for the id + 1 for the `edge` kind) |

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
border-style:     solid;         /* solid | dashed | dotted */
direction:        auto;          /* up | down | left | right | auto (hint, see below) */
label-position:   middle;        /* start | middle | end | <0.0..1.0> */
label-offset:     0px;           /* perpendicular nudge of the label, in pixels */

/* karasu-specific properties (not standard CSS) */
shape:            box;           /* box | user | cylinder | queue | hexagon | cloud | url("...") */

/* Annotation properties (badge display) */
badge-color:      #EF4444;
badge-icon:       "⚠";
badge-label:      "Deprecated";
```

---

## shape property

| Keyword | Shape | Typical use |
|---------|-------|-------------|
| `box` | Rounded rectangle | service, domain (default) |
| `user` | Person (head + body) | user |
| `cylinder` | Cylinder | databases |
| `queue` | Horizontal cylinder | queues |
| `hexagon` | Hexagon | microservices |
| `cloud` | Cloud | external cloud services |

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

### Scope

| View | Behavior |
| --- | --- |
| `system` | Honored as described above. |
| `deploy` | Ignored. A `style-column-ignored-non-system-view` warning is emitted on resolution. |
| `org`    | Ignored. Same warning. |

Invalid values (anything other than `left` / `center` / `right`) emit a
`style-column-invalid-value` warning and are dropped.

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

### `label-offset` — `<number>px`

Perpendicular nudge of the label relative to the edge, measured in
pixels. Useful when two labels still stack after `label-position` alone.

```css
edge#parallelA { label-offset: 8px; }
edge#parallelB { label-offset: -8px; }
```

Sign convention: positive offset rotates the segment direction `(dx, dy)`
90° counter-clockwise. In SVG coordinates that means a positive offset
shifts the label *below* an edge flowing rightward and to the *left* of
an edge flowing downward. Flip the sign if the resulting side is the
wrong one for the diagram.

The offset is independent of the existing `-6px` typographic lift the
renderer applies above the anchor — the lift stays in place to keep
labels off the line.

Two-axis offset (`label-offset: <dx>px <dy>px`) is intentionally not
supported. Single-axis perpendicular nudge covers the "labels still
overlap" use case while keeping the spec narrow.

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
