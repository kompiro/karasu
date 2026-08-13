---
"@karasu-tools/core": patch
"karasu": patch
---

Text is centred with an em-unit `dy` instead of `dominant-baseline`. The attribute belongs to the SVG text module, which rasterizers outside the browser drop without a word — the text then falls to its baseline and sits 3 to 4.5px too high inside its card. `dy` is core SVG 1.1, so an exported diagram now reads the same in Inkscape, CairoSVG or an Office import as it does in a browser. Positions move by at most 0.35px; layout coordinates are unchanged. Issue #2473, ADR-2473.
