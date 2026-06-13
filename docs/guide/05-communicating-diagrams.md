# Guide: Communicating Diagrams — Style, Legend, and CI

> **English**（this file） · [日本語](05-communicating-diagrams.ja.md)
>
> 📚 Guide series — Part 5 of 5 ｜ ← Prev: [Access Paths & Clients](04-access-paths.md)

The `.krs` text is the single source of truth for the model, but turning it into a **diagram that communicates to the reader** in reviews and exports takes one more layer of effort. Show ownership and state with color, bake "what does this color mean" into the diagram with a legend, keep diagrams always fresh with CI — this guide covers the layer that makes karasu diagrams **a shared team asset.**

Where the other guides ([Boundary Design](01-service-team-design.md) / [Onboarding](02-onboarding.md) / [Evolution](03-evolution.md)) are about "what to write in the model," this one is about "how to communicate the model you wrote."

For the precise style spec, see [`docs/spec/style.md`](../spec/style.md); for legends, see [`docs/spec/syntax.md`](../spec/syntax.md). The `.krs` / `.krs.style` snippets below have been verified.

---

## 1. `.krs.style` basics

Write styles in a file (`.krs.style`) separate from the logical model (`.krs`), and `@import` it at the top of the `.krs`. Styles apply with **global scope** to the whole file; if the same selector is defined more than once, last wins (with a warning).

```krs
// system.krs
@import "theme.krs.style"

system Shop {
  service OrderService { label "Order" }
  service Legacy [external] @deprecated { label "Old core" }
  OrderService --> Legacy "stock query"
}
```

```css
/* theme.krs.style */
service                { background-color: #e5e7eb; }   /* type selector */
#OrderService          { background-color: #dbeafe; color: #1e40af; }  /* ID selector */
service[external]      { background-color: #f3f4f6; color: #374151; }  /* compound */
@deprecated            { opacity: 0.6; badge-label: "deprecated"; }     /* annotation */
edge[async]            { stroke-style: dashed; }                       /* edge + tag */
```

Selectors can be **type / tag / annotation / ID / compound / edge**, and cascade by specificity just like CSS (type 1 < tag·annotation 10 < ID 100). Because the logical model and styles live in separate files, you can apply **multiple themes to the same model** (one for review, one for print, etc.).

---

## 2. Team-based color theming — the color counterpart of inverse Conway

Showing ownership with color makes the overview communicate "whose area is this" at a glance. Assign a color per service id (or `[external]`).

```css
/* per-team colors — from payment-platform/theme.krs.style */
#Gateway    { color: #1e40af; background-color: #dbeafe; }  /* Gateway team — blue */
#RiskEngine { color: #92400e; background-color: #fef3c7; }  /* Risk team — amber (caution) */
#Ledger     { color: #065f46; background-color: #d1fae5; }  /* Ledger team — green (trusted) */
service[external] { color: #374151; background-color: #f3f4f6; }  /* external — neutral gray */
```

Symmetric to recording ownership **as structure** with `owns` in [Boundary Design Guide §2](01-service-team-design.md#2-the-inverse-conway-maneuver--designing-teams-to-fit-the-architecture), color communicates the same ownership **as vision.** Full example: [`examples/payment-platform/`](../../examples/payment-platform/) (`@import`s `theme.krs.style`).

---

## 3. Showing lifecycle state with color and badges

The lifecycle annotations from the [Evolution Guide](03-evolution.md) (`@deprecated`, etc.) can be reflected visually with style selectors. Dim with `opacity`, attach a badge with `badge-label` / `badge-icon` / `badge-color`, and make migration state visible at a glance on the diagram.

```css
@deprecated    { opacity: 0.55; badge-label: "deprecated"; badge-color: #9ca3af; }
@experimental  { badge-label: "experimental"; badge-icon: "🧪"; badge-color: #f59e0b; }
@new           { badge-label: "new"; badge-color: #16a34a; }
```

Because annotations are inherited parent-to-child ([Evolution Guide §2](03-evolution.md#2-annotation-inheritance--context-isnt-lost-on-drill-down)), the same style applies to nodes under a `@deprecated` service when you drill in.

---

## 4. Legends (`legend`) — baking color↔meaning into the diagram

Using color always raises the question "what's this color?" The `legend` block declares the color-to-meaning mapping, and the renderer draws it as a footer band below the diagram. No verbal explanation needed in exports or reviews.

```krs
legend "Owner / State" {
  swatch #dbeafe "Order team"        // any hex color + description
  ref [external]  "External system"  // resolves color from .krs.style
  ref @deprecated "Scheduled for removal"
}
```

- **`swatch #hex "description"`** specifies a color directly.
- **`ref <target> "description"`** resolves the color from the `.krs.style` cascade. The target can be a tag `[external]`, an annotation `@deprecated`, a node id `#Order`, or a type `service`.
- Place `legend` at the top level. Add a **view scope** like `legend deploy` / `legend org` to show it only in that view. Exact-match scoping shows the right legend at each drill-down level (details in [`docs/spec/syntax.md`](../spec/syntax.md)).

Legend labels are strings written directly by the author and are exempt from i18n. Sample: [`examples/feature-samples/legend.krs`](../../examples/feature-samples/legend.krs).

---

## 5. Edge styling — follow the logical classification

Edges can also be selected by type / tag / id. The key point is to **use tag selectors for overrides based on logical classification.**

```css
edge[async] { stroke-style: dashed; color: #94a3b8; }  /* async dashed */
edge[write] { color: #ef4444; }                        /* write paths red */
edge[read]  { color: #3b82f6; }                        /* read paths blue */
```

`edge[write]` / `edge[read]` follow the tags synthesized from a `usecase`'s `operations`, so changing the CRUD recolors the right edges. Use `edge#<id>` (an author-defined edge id) only when you want to change **one specific edge.** Details in [`docs/spec/style.md`](../spec/style.md).

---

## 6. Keeping diagrams fresh with CI

Because `.krs` is text, you can run `karasu render` in CI to generate and commit back an SVG. The committed SVG renders natively in GitHub's file browser and Markdown previews, so **the team sees up-to-date architecture diagrams without installing karasu.**

```yaml
# .github/workflows/karasu.yml
- name: Render diagram
  run: npx --yes karasu@0.1.0 render docs/index.krs --output docs/architecture.svg
```

- Templates: [`examples/github-actions/`](../../examples/github-actions/) (single-file / matrix for multiple entries). Details in [`docs/github-actions.md`](../github-actions.md).
- To split views, call `--view system|deploy|org` multiple times.
- `@import` resolves **relative to the entry file**, so in CI you specify one top-level `index.krs` and all imported files resolve.
- Prefer a **pinned version** (`karasu@0.1.0`) over `karasu@latest` to avoid unexpected breakage.

To show the diagram diff in a PR, pair this with `karasu diff` from [Evolution Guide §4](03-evolution.md#4-karasu-diff--visualizing-architecture-change).

---

## 7. Escape layout tweaking to draw.io

karasu **does not pursue fully automated layout optimization** (a [non-goal](../concepts.md#goals-and-non-goals)). When you need a pixel-perfect figure for slides or external docs, rather than growing the layout engine, **escape** to a draw.io export.

```console
$ karasu render index.krs --format drawio --output arch.drawio
```

draw.io (mxGraph XML) emits one page per view and per drill-down level. This balances "readability of the text source" with "polish for presentation" — the truth of the model stays in `.krs`, and visual polish is delegated to a downstream tool.

---

## Checklist

- [ ] Are styles separated into `.krs.style` and `@import`ed at the top of `.krs`?
- [ ] Do you show owners (teams) with color and lifecycle state with badges?
- [ ] When you use color, did you bake the meaning into a `legend`?
- [ ] Do you select edge logical classifications (read/write/async) with tag selectors (avoiding `edge#id` overuse)?
- [ ] Does CI run `karasu render` and commit back the SVG (version pinned)?
- [ ] Is presentation polish escaped to a draw.io export?

---

## Further reading

- Related guides: [Boundary Design](01-service-team-design.md) / [Onboarding](02-onboarding.md) / [Evolution](03-evolution.md)
- Precise style spec: [`docs/spec/style.md`](../spec/style.md)
- Legend spec: [`docs/spec/syntax.md`](../spec/syntax.md)
- Tags and annotations: [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)
- CI integration: [`docs/github-actions.md`](../github-actions.md)
- Team-color example: [`examples/payment-platform/`](../../examples/payment-platform/)
