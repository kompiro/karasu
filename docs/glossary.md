# Keystone & permalink glossary

> **English**（this file） · [日本語](glossary.ja.md)

The permanent home for the load-bearing terms coined in the **keystone**
deliberation and the **permalink family** — vocabulary that is now used across
the PRD ([`docs/prd/keystone-primary-path.md`](prd/keystone-primary-path.md)),
the permalink epic ([#1826](https://github.com/kompiro/karasu/issues/1826)),
the [roadmap](roadmap.md), and the ADRs. These terms are **defined here
canonically**: other documents should *reference* this page rather than
re-state the definitions, so the vocabulary cannot drift.

This is a different glossary from [`docs/spec/glossary.md`](spec/glossary.md),
which indexes the **modeling-language** vocabulary (element kinds, tags,
diagnostics, …). This page holds the **product-direction and permalink**
vocabulary instead. Where a term's mechanics live in another authoritative doc
(the permalink anchor contract, a design doc, an ADR), the entry links there for
the details and keeps only the definition here.

> Related TPLs: [TPL-20260716-01](test-perspectives/TPL-20260716-01-keystone-terms-single-home.md) — these terms have a single canonical home; the PRD, roadmap, epic, and specs must reference this page, not re-define the terms, and entries here must not contradict the mechanics docs they link to.

## Product direction (keystone)

Coined in the keystone deliberation (2026-06-28) that fixed karasu's primary
path. The full reasoning is in the PRD; the settled decision is summarized in
the [roadmap keystone section](roadmap.md#keystone-primary-path-と主-surface決定済み-2026-06-28).

- **read / record split** — the division of labor between the two surfaces:
  **karasu-nest reads** (an unfamiliar system — a funnel/utility for orientation)
  while **karasu proper records** (your own system — the retained product). Deep
  retention lives on the *record* side.
- **funnel / retained** — the two adoption stages. The **funnel** is the
  awareness/acquisition surface (the web faces: app / nest); the **retained**
  product is the one users return to (in-repo authoring + recording). nest is
  funnel, not the retention axis.
- **record-as-byproduct** — the principle that structural records fall out as a
  *byproduct of design decisions*, rather than being maintained as a separate
  chore. Making "system changed → update the diagram" *not* the primary return
  trigger is how karasu avoids doc-rot structurally (keystone decision #3).
- **source of truth / rendering layer** — the source of truth is the in-repo
  `.krs` text (version-controlled); rendering and permalinks are the app / nest
  URL layer. They are two layers over the *same* `.krs`, not competing copies.
  See also **Text as the source of truth** in the
  [modeling glossary](spec/glossary.md#core-concepts).
- **supply → share → explore** — the adoption-funnel hypothesis: `.krs` is
  *supplied* (e.g. by reverse-engineering), *shared* to spread, and drilled into
  to *explore*. A hypothesis about how the funnel feeds retention, not a shipped
  feature.

## Permalink family

karasu permalinks are the addresses that ADRs / PRs / docs use to *point at*
karasu structure. The link direction is **ADR → karasu** (karasu holds no
decision metadata; the decision lives in the ADR, which points at the karasu
permalink — keystone decision #2). The family classifies a permalink along a few
independent axes:

- **permalink (karasu's)** — an address that an external document uses to point
  at a karasu structure. The reference direction is always **ADR → karasu**.
- **deep permalink** — addresses a *specific structural element or view* inside
  a model (a node id, a drilled `:target` anchor), not the whole model. The
  authoritative fragment-anchor contract is
  [`docs/spec/permalink.md`](spec/permalink.md); nest's inline share reaches
  element depth through the `SharePayload.target`.
- **repo-backed permalink** — resolves a `.krs` from a GitHub repo
  (`/<owner>/<repo>`) and renders it, instead of carrying the payload inside the
  URL. The nest Phase 2 form; see
  [ADR-1828](adr/1828-repo-backed-ref-pinned-permalink.md).
- **ref-pinned permalink** — pins a repo-backed permalink to a specific git
  ref / SHA, so it renders that point-in-time structure immutably — the shape an
  ADR's point-in-time record wants. See
  [ADR-1828](adr/1828-repo-backed-ref-pinned-permalink.md)
  (SHA enforcement and the ref-less-default-HEAD resolver).
- **inline snapshot permalink** — the current nest `?s=` form: the model is
  frozen into the URL itself (immutable, but not repo-linked, and long — hence
  taka shortening). The near-term stand-in until repo-backed / ref-pinned land.

`deep` is about *what a permalink points to* (granularity); `repo-backed`,
`ref-pinned`, and `inline snapshot` are about *how the payload is sourced and
pinned* — the axes compose (e.g. a deep, repo-backed, ref-pinned permalink).

## See also

- [`docs/spec/glossary.md`](spec/glossary.md) — the modeling-language glossary
  (element kinds, relationships, tags, diagnostics).
- [`docs/spec/permalink.md`](spec/permalink.md) — the authoritative deep
  permalink anchor contract.
- [`docs/roadmap.md`](roadmap.md) — the keystone decision and the pillars that
  follow from it.
- [`docs/prd/keystone-primary-path.md`](prd/keystone-primary-path.md) — the full
  keystone deliberation these terms were coined in.
