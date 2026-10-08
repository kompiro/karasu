---
"@karasu-tools/core": patch
---

Export `wrapSvgForOgpFrame`, which letterboxes a diagram SVG into a fixed 1200×630 OGP frame, so both Workers that rasterize OGP images (the app's `/render` and the gallery's `/g/<id>/og.png`, #2995) draw the same frame.
