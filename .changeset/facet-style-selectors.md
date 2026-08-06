---
"@karasu-tools/core": minor
"karasu": minor
---

`.krs.style` can now match on facet membership: `[facets=pii]` styles every element that declares `facets pii`, compounds with a kind (`database[facets=pci]`), and repeats to require several memberships at once. It scores 10 — exactly what the `[pii]` tag selector scores — so a sheet can be migrated one rule at a time without changing which rule wins.

With that migration target in place, `.krs.style` selectors naming a tag or annotation outside the tool vocabulary are now deprecated: `style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin` (warnings). **The rules still apply** — this release only announces the change; syntax v2.0 is where they stop matching. `docs/spec/style.md` § Facet selectors carries the before/after rewrite.

`facet` remains **experimental** notation (`.krs language v1.0` unchanged — this is an additive diagnostic plus a new selector form, not a language-version transition).
