---
"@karasu-tools/core": patch
"karasu": patch
---

Shorten the canvas width-budget candidate ladder from 12 steps to 8 (#2761). The
ladder's length was never measured when ADR-2593 introduced the search; on a
10k-line model the candidates after the first were about a third of an all-views
render. Eight steps takes roughly 70 ms of that back on the reference corpus for
+0.05% total canvas area: 4 of 405 drill-down levels redraw, two of them
*smaller*, and no level newly falls outside the readable aspect band. The bundled
examples and every deploy view are byte-identical.
