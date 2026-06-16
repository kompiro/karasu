---
title: karasu
template: splash
hero:
  tagline: Text-based architecture modeling that separates logical and physical structure — inspired by the C4 model, with its own vocabulary.
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

karasu (鴉) is a text-based architecture modeling tool. You describe systems,
domains, teams, and deployments in `.krs` files and karasu renders SVG diagrams —
keeping the **logical** structure (what exists and how it relates) separate from
the **physical** structure (where it runs).

- **[Guides](guide/)** — designing service and team boundaries, onboarding, evolution.
- **[Reference](spec/syntax/)** — the `.krs` / `.krs.style` syntax, tags, and annotations.
- **[Concepts](concepts/)** — the design philosophy behind karasu.
