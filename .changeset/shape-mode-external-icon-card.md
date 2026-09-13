---
"@karasu-tools/core": patch
"karasu": patch
---

Shape mode now draws an external SVG icon (`shape: url(...)`) as a proper card:
the `background-color` / `border-color` / `border-width` / `border-radius` you
declare are painted behind the icon, and the icon body keeps its `viewBox`
aspect ratio instead of being stretched to the card the text measured. Icon
mode is unchanged (#2696).

**This changes how an existing shape-mode `url()` node looks**: it used to draw
the icon alone on the canvas, and now draws it on the card its style declares —
which until now was silently dropped. Add `background-color: transparent;` and
`border-width: 0;` to that rule to keep the icon on the bare canvas.

With that migration target shipped, **icon display mode is deprecated** and
will be removed in the next major version — use shape mode with
`shape: url(...)` instead (ADR-2376).
