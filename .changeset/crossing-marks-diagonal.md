---
"@karasu-tools/core": minor
"karasu": minor
---

Group by team (system view): crossing marks now also cover **diagonal** crossings, not just right-angle ones (#1939 Part 1). `computeCrossingMarks` detects any strict-interior segment crossing and draws the hop arc oriented along the more-horizontal segment, so a "clear" intra-band edge left straight no longer produces an unmarked crossing. Axis-aligned crossings render exactly as before.
