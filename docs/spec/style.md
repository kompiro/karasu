# .krs.style Syntax Reference

> **English** (this file) · [日本語](style.ja.md)

> Language version: **`.krs language v1.0`** — `.krs` and `.krs.style` share one language version (frozen — [ADR-1314](../adr/1314-krs-spec-v1-freeze.md); independent from every package's npm version — [ADR-2124](../adr/2124-version-vocabulary.md)).

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
| Facet | `[facets=pii]` | All elements belonging to the given `facet` |
| Compound (kind + facet) | `service[facets=pii]` | Matches both kind and facet membership |
| ID | `#ECommerce` | A specific node only |
| Edge | `edge` | All edges |
| Edge + tag | `edge[async]` | Edges with the given tag |
| Edge source | `edge[from=ApiGateway]` | All edges originating at the node |
| Edge target | `edge[to=ApiGateway]` | All edges terminating at the node |
| Edge ID | `edge#criticalWrite`, `edge#A->B`, `edge#A-->B` | A specific edge only |
| Boundary | `boundary` | All boundary frames (*Group by: boundary*) |
| Boundary ID | `boundary#pci` | One boundary's frame only |

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
| Facet | `[facets=pii]` | 10 |
| Kind + facet | `service[facets=pii]` | 11 |
| ID | `#ECommerce` | 100 |
| Kind + ID | `team#Platform` | 101 |
| Edge | `edge` | 1 |
| Edge + tag | `edge[async]` | 11 |
| Edge source/target | `edge[from=ApiGateway]` | 11 |
| Edge ID | `edge#criticalWrite` | 101 |
| Boundary | `boundary` | 1 |
| Boundary ID | `boundary#pci` | 101 |
<!-- /gen:reference:selector-specificity -->

`edge#criticalWrite` scores 101 = 100 for the id + 1 for the `edge` kind.
When scores are equal, the later declaration wins (same as CSS).

---

## Facet selectors (`[facets=<id>]`) — experimental

> **Experimental notation (post-v1.0 watch).** `facet` is experimental, so this
> selector is too — backward compatibility is not yet promised, and promotion is
> gated on real-usage evidence ([ADR-1820](../adr/1820-notation-promotion-gate.md)).

Style the elements belonging to a declared `facet` (see
[syntax.md § Cross-cutting membership](syntax.md#cross-cutting-membership-facet--experimental)).

```css
[facets=pii] {
  border-color: #14B8A6;
  border-width: 2px;
}

/* Compound with a kind — only the databases in PCI scope. */
database[facets=pci_scope] {
  background-color: #FEF3C7;
}

/* Repeat to require several memberships at once (AND, like tags). */
[facets=pii][facets=gdpr] {
  border-style: dashed;
}
```

- **Nodes only.** `facets` is a node property in v1, so `edge[facets=...]`
  matches nothing rather than matching every edge.
- **Membership is read from the element**, which is where `facets <id>` is
  written. Nothing about the selector reaches back into the `facet` declaration;
  the declaration carries the concern's metadata, not its members.
- **Undeclared facet ids are not a style-side error.** A `facets pcl` typo is
  reported once, where it is written, by `facet-not-declared` — a selector
  naming the same misspelling simply matches nothing. Reporting it twice would
  ask the author to fix one mistake in two places.
- **Fact and style stay split.** Membership is a fact and lives in `.krs`;
  what a facet looks like is a choice and lives here. The overlay in the
  preview is a third, separate thing: a reader's temporary selection, written
  nowhere.

### Migrating an arbitrary-name tag or annotation selector

`.krs.style` has always matched arbitrary tag and annotation names, and until
now that was the only way to style a cross-cutting concern. Facet selectors are
the replacement, so those selectors are **deprecated in v1.x**
(`style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin`) and
stop matching in syntax v2.0. They keep working meanwhile — dropping a rule
silently would change how existing models look.

**Before** — the name carries the concern, and nothing declares what it means:

```krs
system Shop {
  database CardVault [pci] {}
  service Payments [pci] {}
}
```

```css
[pci] {
  border-color: #F59E0B;
}
```

**After** — the concern is declared once, membership moves to `facets`, and the
selector targets it:

```krs
facet pci {
  label "PCI scope"
  description "In scope for the annual PCI DSS assessment"
  link "https://example.com/policies/pci" "PCI policy"
}

system Shop {
  database CardVault { facets pci }
  service Payments { facets pci }
}
```

```css
[facets=pci] {
  border-color: #F59E0B;
}
```

**Specificity is unchanged** — `[facets=pci]` scores 10, exactly as `[pci]` did.
That is deliberate: a sheet part-way through the migration must not change which
rule wins, or the rewrite would have to be done in one commit.

Three things the model gains that the tag never had: a place for the concern's
own metadata (`description`, `link`), typo detection against the declared set
(`facets pcl` is reported; `[pcl]` was silently a different tag), and the
overlay — a reader can highlight the facet without editing anything.

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — the selector is the effect that keeps `facet` from being inert in the styling dimension. [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md) — a deprecation is announced in the release that ships its migration target, never before. [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — the new selector form round-trips through `karasu fmt` / the sheet tidier.

---

## Source/target edge selectors (`edge[from=<id>]` / `edge[to=<id>]`)

Style **all edges from (or to) a given node** in one rule — the most useful
"color-by-source" aid for dense diagrams, where a hub's fan-out would
otherwise need one `edge#Hub->Target` rule per target.

- `edge[from=<id>]` — every edge whose **source** is the node `<id>`
- `edge[to=<id>]` — every edge whose **target** is the node `<id>`

```css
edge[from=ApiGateway] { color: #3B82F6; }   /* whole ApiGateway fan-out in one color */
edge[from=Scheduler] { color: #10B981; }
edge[to=AuthService] { color: #F59E0B; } /* everything calling AuthService */
```

`<id>` is a node id. It may be a **dot-notation endpoint** (e.g.
`edge[to=OrderDB.OrderTable]`) for synthesized usecase→resource edges,
consistent with the base form `edge#PlaceOrder->OrderDB.OrderTable`. The id is
compared against the edge's `from` / `to` endpoint in the active view.

Both selectors score **11** (`edge` kind 1 + endpoint predicate 10) — the same
tier as `edge[<tag>]`. They combine with tags and a single edge can match both
a `from=` and a `to=` rule:

```css
edge[from=ApiGateway][async] { stroke-style: dashed; }  /* async edges out of ApiGateway */
```

Any attribute other than `from` / `to` (e.g. `edge[source=X]`) raises an
`unknown-edge-selector-attribute` error.

> Related TPLs: [TPL-1761](../test-perspectives/TPL-1755-edge-endpoint-selector-id-form.md)
> (endpoint selectors must compare against the same id form the view stores).

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
[`docs/adr/1096-edge-id-selector.md`](../adr/1096-edge-id-selector.md).

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

> Related TPLs: [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
> — every property declared in this document's `css` fences must exist in
> the in-app reference data, and every `PROPERTY_SCHEMAS` entry must be
> documented here (`stroke-style` was a schema-only ghost before being
> formalized — see ADR-1492 / #1492).

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

## Kind color vocabulary

This section describes how the **builtin** sheet assigns colors to kinds. It is
not a constraint on your own stylesheets — a user rule overrides any of it. It
is written down so the defaults stay readable as a system, and so a kind added
later inherits a rule instead of a fresh guess.

Two rules, plus a hue table.

### Rule 1 — the logical layer separates by fill, not by hue

`domain`, `usecase`, `resource` and `member` all describe one system from one
point of view, so they share a blue family rather than competing for attention
with four unrelated hues. What separates them is how the card is filled:

| Kind | Treatment | Reading |
|------|-----------|---------|
| `domain` | Navy fill | Structure this layer owns |
| `usecase` | **Fill-less** — canvas shows through, border only | Behaviour, lighter than the structure holding it |
| `resource` | Neutral slate fill | A *reference* to something the physical layer owns |
| `member` | Navy fill, `shape: user` | Already separated by shape |

A fill-less kind has two consequences worth knowing about:

- **Its border is its outline.** With no fill, the border is the only thing
  drawing the card, so it carries the WCAG non-text bar of 3:1. That bar is
  measured over three things at once: the bare canvas, the canvas under stacked
  boundary-frame tints (membership is 1:N, so frames overlap — up to three deep
  is checked), and the card at the opacity `@deprecated` fades it to, where a
  filled card would still have a body but a fill-less one has only the outline.
  Clearing all three is why the two themes' `usecase` borders sit near opposite
  ends of the blue ramp, and why both are further from the canvas than a purely
  visual choice would put them.

  Opacity states lighter than that fade — the facet-overlay dim and the diff
  ghost — are exempt, and not by preference: at those alphas no color reaches
  3:1 at all. White is the best a border can do, and over the dark canvas it
  reaches 2.50:1 at the dim's alpha and 2.70:1 at the ghost's. This is the
  carve-out WCAG 1.4.11 makes for inactive components.
- **Boundary membership becomes visible through it.** Under *Group by:
  boundary*, the frame's tint reaches the card interior instead of being hidden
  behind an opaque fill, so a fill-less card reads as part of its boundary in
  color, not only in position.

Use `transparent` — not `none` — to make a card fill-less. `transparent` still
paints, so the card keeps its hit area for clicks and hovers.

### Rule 2 — a deploy kind is one hue taken three ways

Each deploy kind owns a hue. The three colors of its card are that same hue at
three lightnesses, so the accent belongs to the card instead of floating on it:

- `border-color` / `badge-color` — the accent, full chroma
- `background-color` — the fill, at the lightness end **nearest the canvas**, so
  the card sits on the canvas rather than punching a hole in it
- `color` — the label, at the **opposite** end, as far from the fill as the hue
  goes

The two lightness ends swap with the theme, which is why the same rule produces
a near-black `oci` fill on the dark canvas and a pale one on the light canvas.
Anchoring the rule to the canvas rather than to an absolute lightness is what
lets one sentence describe both themes.

| Kind | Hue |
|------|-----|
| `oci` | blue |
| `lambda` | purple |
| `jar` | green |
| `war` | orange |
| `function` | yellow |
| `assets` | cyan |
| `job` | red |
| `artifact` | gray |
| `store` | teal |

The table fixes the **hue and the rule**, not the hex values. Concrete hexes are
whatever satisfies both rules and the contrast guard in both themes: every
kind that sets `background-color` also sets a paired `color`, and that pair
clears 4.5:1. Adding a kind therefore means adding a row here and deriving its
three colors from that row — the guard verifies the result
(`packages/core/src/builtins/default-style-contrast.test.ts`).

> Note that `job` shares red with `edge[cyclic]`. That collision predates this
> section and is kept rather than reshuffling established kind colors; new kinds
> should not add another one.

> Related TPLs: [TPL-2421](../test-perspectives/TPL-2421-kind-color-hue-table.md)
> — adding a kind means adding a hue-table row and deriving fill / text from it,
> with the contrast guard verifying the hex;
> [TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md)
> — a kind that sets `background-color` sets the paired text `color`, per theme;
> [TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)
> — colors drawn as text directly on the canvas are contrast-checked per theme.

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

> Related TPLs: [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)

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

A row still wraps early if it would exceed the row-width budget, so an
oversized `grid-columns` cannot overflow the frame. On the system, drill-down
and deploy views that budget is not a fixed constant: the layout tries a fixed
list of candidate widths and keeps the one whose canvas holds the least empty
space while staying inside a screen-shaped aspect band, so a view that would
otherwise grow into a tall ribbon spreads sideways instead. The choice depends
only on the model and on layout constants — never on the viewport — so the same
input always renders the same SVG, and a view that already fits keeps the exact
layout it had. The org member grid is not part of that: it wraps at a fixed
number of cards per row, which `grid-columns` overrides. Unlike `column` (system
view only), this hint is honored on the system and drill-down views and the org
member grid. The deploy view auto-balances its container grid as well, and a container
holding more than three units wraps them into a grid too rather than stacking
them in one column. It groups containers by `realizes` target rather than by a
container node, so it has no per-container `grid-columns` override in v1.

Invalid values (anything that is not a positive integer, e.g. `0` or `2.5`) emit
a `style-grid-columns-invalid-value` warning and are dropped; the layout
auto-balances instead.

> Related TPLs: [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md) — limit how much is shown at once; a single view keeps a graspable resolution (the balanced grid keeps visual density bounded). [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md) — the per-view row-width budget is chosen by a search, which has to stay deterministic, floor-first and monotone or this section's "same input, same SVG" promise breaks.

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
  [`docs/adr/1135-edge-direction-horizontal.md`](../adr/1135-edge-direction-horizontal.md).

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

See [`docs/adr/9019-edge-direction-style.md`](../adr/9019-edge-direction-style.md)
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

**Auto placement vs. author intent.** When the author leaves both
`label-position` and `label-offset` at their defaults, the renderer may
automatically nudge a label off a collision with a node card or another
label (edge-label collision-avoidance, [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)).
This auto pass fires
**only** on default-positioned labels; setting either property opts the
label out of auto placement, so an explicit `label-position` /
`label-offset` always wins.

> Related TPLs: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md) — label placement is measured numerically (label↔label / label↔node overlap), non-colliding diagrams stay byte-stable, and author-set positions are never auto-moved.

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
> [ADR-1184](../adr/1184-edge-label-position-offset.md).

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

## Boundary frame selectors (`boundary` / `boundary#<id>`)

Under *Group by: boundary* the system view draws a dashed frame around each
`boundary`'s members, in an identifying colour cycled by declaration order. A
style sheet can take that colour over.

```css
boundary            { border-style: solid; }   /* every frame */
boundary#pci        { border-color: #C0392B; } /* one boundary */
```

The keyword is what selects the id space. A boundary is not a node, so a bare
`#pci` addresses a *node* called `pci` and never reaches the frame, exactly as
`#criticalWrite` addresses a node rather than the edge `edge#criticalWrite`
names. Specificity follows from the same parts as everywhere else: `boundary`
scores 1, `boundary#pci` scores 101 (100 for the id + 1 for the kind).

Boundaries a sheet does not name keep their cycled colour, so naming one does
not disturb the rest.

**Scoped boundaries.** A `boundary` declared inside a node block has identity
(declaring scope, id), so two scopes may each hold a `pci`. `boundary#pci` names
the id without naming a scope, and therefore matches that id in **every** scope,
including the top level. There is no way to target one scope's boundary today; if
that turns out to be needed, a qualified form can be added without changing what
the unqualified one means.

**Supported properties:**

| Property | Effect |
|----------|--------|
| `border-color` | The frame's colour. Also drives the fill and the title, unless those are set explicitly |
| `background-color` | The frame's low-alpha fill, when it should differ from `border-color` |
| `color` | The frame title, when it should differ from `border-color` |
| `border-width` | Frame line width (px) |
| `border-style` | `solid` / `dashed` / `dotted`. Default `dashed` |

> **Note**: one declaration of `border-color` repaints the stroke, the fill and
> the title together. A boundary's colour is what lets two overlapping frames
> read as an overlap rather than as one nested in the other, so a single
> declaration must not split it in two. Set `background-color` / `color` when
> you want them apart.

> **Note**: `shape` / `opacity` / `border-radius` / `font-*` / `badge-*` are
> ignored on a frame. A frame that reaches out of its band is drawn as a
> rectilinear outline, which has no corner radius to set.

Team frames (*Group by: team*) are addressed differently, because a team **is** a
node and `#<id>` already reaches it — see
[Team frames](#team-frames-group-by-team) below.

`boundary` is experimental notation, so this selector carries the same
no-compatibility-promise as the construct it styles
([syntax.md](syntax.md#grouping-the-system-view-boundary--experimental)).

> Related TPLs: [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md) — a boundary's colour reaches the frame and the `◇` tab, which are drawn by different code; both read one resolver so a style override cannot repaint only half of it. [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — a bare `boundary` rule parsed and did nothing before this selector existed; it now has an effect. [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) — the specificity rows above are generated from `reference-data.ts`, not written here.

---

## Organization diagram node selectors (Org Tree View)

The Org Tree View supports `team` / `member` kind selectors and ID selectors (`#NodeId`).

| Selector | Target |
|----------|--------|
| `team` | All team cards |
| `member` | All member cards |
| `#TeamId` | A specific team card |
| `team#TeamId` | The same, narrowed to the team kind |
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

### Team frames (*Group by: team*)

Under *Group by: team* the system view draws a frame around each team's members.
That frame and the card above are two renderings of **one** team, so the
selectors above address both. There is no separate frame keyword.

```css
team          { border-style: solid; }   /* every team card, and every team frame */
#Platform     { border-color: #C0392B; } /* the Platform card, and the Platform frame */
team#Platform { border-color: #C0392B; } /* the same, narrowed to the team kind */
```

`team#<id>` is a **compound** selector, not a second id space: it means "the node
with this id, if it is a team". It scores 101 (100 for the id + 1 for the kind),
so it beats a bare `#<id>` at 100 and a bare `team` at 1. This is the opposite of
`boundary#<id>`, where the keyword names an id space a bare `#<id>` cannot reach
at all — a boundary is not a node, and a team is.

**Which property reaches which rendering.** Each one lands on the part of the
frame that answers to the part of the card it paints:

| Property | Card (Org Tree View) | Frame (*Group by: team*) |
|----------|----------------------|--------------------------|
| `border-color` | Border colour | Outline colour |
| `background-color` | Card fill | Low-alpha tint inside the frame |
| `color` | Label colour | Frame title colour |
| `border-width` | Border width (px) | Outline width (px) |
| `border-style` | not applied | `solid` / `dashed` / `dotted`. Default `dashed` |
| `border-radius` / `font-size` / `font-weight` / `font-family` | as documented above | not applied |

> **Note**: unlike a boundary frame, a team frame's tint does **not** follow
> `border-color`. Boundary frames overlap, and there one colour has to reach the
> tint or the overlap reads as nesting. Team frames never overlap, so each
> property follows the card instead, which is the reading a single declaration
> predicts.

**Each rendering keeps its own default.** The built-in sheet's `team { … }` rule
is the *card's* default and does not reach the frame; the frame's default is the
muted dashed outline the view draws on its own. So a team no sheet names is
unchanged, and naming one team does not disturb the rest.

> Related TPLs: [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md) — a team is drawn as a card and as a frame by different code, and one declaration must not repaint only half of it. [TPL-2269](../test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md) — the built-in sheet styles the card only; reading it for the frame would repaint every frame by default. [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — `team#<id>` survives `karasu fmt` instead of being re-emitted as the wider `#<id>`. [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) — the specificity scores quoted here are generated from `reference-data.ts`.
