---
"@karasu-tools/core": minor
"karasu": minor
---

Draw a two-way pair of edges (`A -> B` and `B -> A`) of the same kind and look as one line with an arrow at each end, so a dense canvas draws fewer lines without moving any card. Both edges stay separate: each draws the half on its own target's side, keeps its own hover, hit area and diff state, and its label starts with an arrow showing which way that half runs. Pairs that differ in kind, colour, width, stroke style or diff state stay two lines (#3027).
