---
"@karasu-tools/core": patch
"karasu": patch
---

Shape mode now draws an external SVG icon (`shape: url(...)`) as a proper card:
the `background-color` / `border-color` / `border-width` / `border-radius` you
declare are painted behind the icon, and the icon body keeps its `viewBox`
aspect ratio instead of being stretched to the card the text measured. Icon
mode is unchanged (#2696).

With that migration target shipped, **icon display mode is deprecated** and
will be removed in the next major version — use shape mode with
`shape: url(...)` instead (ADR-2376).
