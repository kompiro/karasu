---
"@karasu-tools/core": minor
"karasu": minor
---

Edge labels no longer pile up on a dense canvas. A label longer than 48 characters is drawn truncated with `…`, and a label that cannot be seated clear of node cards, other labels and other edges' lines is left off the canvas instead of being drawn into the collision. Nothing is lost: the edge keeps the authored text as `data-edge-label` and in a `<title>`, so hovering the edge shows all of it, in a static SVG too.

Two new `.krs.style` edge properties control this: `label-max-chars: <n> | none` (default `48`) and `label-display: auto | always | hover` (default `auto`). Write `edge { label-max-chars: none; label-display: always; }` for the previous behaviour. A canvas whose labels are short and do not collide renders exactly as before; a ghost edge's label that used to overlap a card now moves clear of it. (#3030, part of #3022)
