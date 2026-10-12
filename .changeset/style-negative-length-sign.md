---
"@karasu-tools/core": patch
"karasu": patch
---

A negative number or length in a `.krs.style` sheet keeps its sign: `label-offset: -20px` now moves the edge label up instead of down. A negative `border-width`, `border-radius`, `font-size` or `stroke-width` is reported as `style-out-of-range` and the default is drawn (#3032).
