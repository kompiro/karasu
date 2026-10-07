---
"@karasu-tools/core": patch
"karasu": patch
---

Crossing hops that share a stroke and are drawn one after another are now one `<path>`, with each hop as a subpath, instead of one element per hop. Hops keep their positions and paint order. On a large model this cuts the SVG by about a quarter and the number of hop elements by about 98% (#2956).
