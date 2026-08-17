---
"@karasu-tools/core": patch
"karasu": patch
---

Converge the multi-system root view with the single-system layout pipeline
(#2521). The root view now sizes its canvas around routed edges instead of
container rects alone, so a dense fan-in no longer draws trunk lanes outside
the viewBox (#2513); it seats edge endpoints on each shape's drawn outline
like every other surface does (#2515); and both pipelines share one
placement pass, which fixes an off-by-one-gap wrap threshold and brings
crossing minimisation to drill-down views (#2514). Six bundled examples gain
fewer edge crossings as a result.
