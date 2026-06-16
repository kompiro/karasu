# karasu Guides

> **English**（this file） · [日本語](README.ja.md)

Task-oriented how-to guides (5 chapters). For the precise syntax spec see [`docs/spec/`](../spec/); for the design philosophy see [`docs/concepts.md`](../concepts.md). Each guide has an English version (`.md`) and a Japanese version (`.ja.md`).

## Recommended reading order

Read end to end and you traverse the full loop of working with architecture in karasu: **design it → read it → evolve it → communicate it.** Later chapters build on the vocabulary of earlier ones, so on a first pass, read top to bottom. Each guide links to its previous / next chapter at the top.

| Ch. | Guide | Audience | Contents |
|-----|-------|----------|----------|
| 1 | [Service/Team Boundary Design](01-service-team-design.md) ([JA](01-service-team-design.ja.md)) | Architects | service splits from domain dependencies, the inverse Conway maneuver, per-team file splitting, CRUD matrix |
| 2 | [Onboarding](02-onboarding.md) ([JA](02-onboarding.ja.md)) | New hires / hand-offs | scaffold from existing assets with `translate`, read a system down into diagrams |
| 3 | [Evolution & Migration](03-evolution.md) ([JA](03-evolution.ja.md)) | People driving change | lifecycle annotations & inheritance, `karasu diff`, staged migration (Strangler Fig) |
| 4 | [Access Paths & Clients](04-access-paths.md) ([JA](04-access-paths.ja.md)) | Product architects | `user → client → service`, `handles` / `delivers`, form-factors / capabilities |
| 5 | [Communicating Diagrams (style, legend, CI)](05-communicating-diagrams.md) ([JA](05-communicating-diagrams.ja.md)) | Everyone | `.krs.style` theming, `legend`, keeping diagrams fresh in CI, draw.io export |

## Chapter flow

```
Ch.1 Boundary Design → Ch.2 Onboarding → Ch.3 Evolution → Ch.4 Access Paths → Ch.5 Communicating
(design)               (comprehension)    (change)         (product surfaces)   (sharing diagrams)
```

- **Chapters 1–3** follow the architecture lifecycle (design → comprehension → evolution). Ch.1 teaches the foundational vocabulary (domains / services / implicit edges / `owns` / file splitting), Ch.2 uses it to read an existing system down, and Ch.3 changes it over time.
- **Chapters 4–5** are cross-cutting perspectives useful at any stage, placed later because they build on the earlier vocabulary. Ch.4 covers a product's surfaces (access paths); Ch.5 covers making diagrams shareable (style / legend / CI).

If you only need one topic, each chapter also stands alone — in-chapter links point to any prerequisites.

## Rendered diagrams (generated — do not hand-edit)

Selected "hero" `.krs` snippets carry a rendered SVG right below the code, so you see karasu's actual auto-layout output next to the source. The fenced ```krs block stays the single source of truth: an HTML-comment marker above the block (e.g. `<!-- render: system id=01-monolith -->`) tells the generator which snippet to render and which view (`system` / `deploy` / `org`) to use. The SVG and the `![](diagrams/…)` image reference are generated — the image lives in a `<!-- gen:guide-diagram:<id> -->` region; don't hand-edit it.

- Regenerate after changing a marked snippet: `pnpm gen:guide-diagrams`
- CI runs `pnpm gen:guide-diagrams --check` (and lefthook on push); it fails if a committed SVG or image ref is stale. Snippets render to `diagrams/<id>.svg` (English) and `diagrams/<id>.ja.svg` (Japanese), with the `light` theme for GitHub's white background.
