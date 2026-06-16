---
title: karasu
template: splash
hero:
  tagline: A text-based DSL for describing the logical, physical, and organizational dimensions of a system in one language — built to co-design teams and architecture together.
  image:
    alt: karasu
    # Relative to the synced location src/content/docs/index.md (ja is one level
    # deeper at ja/index.md, so home/ja.md needs one extra ../).
    file: ../../assets/karasu-logo.png
  actions:
    - text: Read the guides
      link: guide/
      icon: right-arrow
      variant: primary
    - text: Syntax reference
      link: spec/syntax/
      icon: open-book
    - text: GitHub
      link: https://github.com/kompiro/karasu
      icon: external
---

## What is karasu?

karasu (鴉) is a text-based DSL for architecture. In one `.krs` language you describe
a system's three dimensions — the **logical** structure (services and domains and how
they relate), the **physical** structure (the deployment units that realize them), and
the **organizational** structure (the teams that own them) — so teams and architecture
can be co-designed together. karasu renders each dimension as an SVG diagram you can
drill down into.

- **[Guides](guide/)** — designing service and team boundaries, onboarding, evolution.
- **[Reference](spec/syntax/)** — the `.krs` / `.krs.style` syntax, tags, and annotations.
- **[Concepts](concepts/)** — the design philosophy behind karasu.
