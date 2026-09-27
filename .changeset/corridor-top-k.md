---
"@karasu-tools/core": patch
"karasu": patch
---

Rendering dense diagrams is faster: when an edge detours through the gaps between cards, the router now picks the nearest few candidate gaps directly instead of sorting all of them for every edge. Output is unchanged (#2944).
