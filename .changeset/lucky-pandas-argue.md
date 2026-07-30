---
"@karasu-tools/core": minor
"karasu": minor
---

`unassigned-domain` now also fires for a `domain` declared directly inside a `system`, not just for a top-level one. Both placements express the same modelling state — "this domain is not assigned to a service" — so the author picks the spelling, not the meaning ([#2184](https://github.com/kompiro/karasu/issues/2184)). Rendering is unchanged: the `(Unassigned)` pseudo-system still wraps only the top-level form, since a system-nested domain already has a container to render in. Files that are silent today may gain this warning; it stays a warning, so nothing that parses now stops parsing.
