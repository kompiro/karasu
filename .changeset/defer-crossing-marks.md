---
"@karasu-tools/core": patch
"karasu": patch
---

Compute edge crossing marks once per view, on the placement that wins the width-budget search, instead of once per candidate. Dense views lay out faster; the drawing is unchanged (#2761).
