---
"@karasu-tools/core": patch
"karasu": patch
---

An edge whose endpoint contains `#` (for example `x -> "y#sync"`) now keeps its own style and `direction`. Before, it could share them with `x -> y`, so a rule on one edge colored or turned both, or neither (#3702).
