---
"@karasu-tools/core": patch
"karasu": patch
---

An edge that has to detour around an obstacle now takes a lane between columns when one is clear, instead of always running out to the edge of the diagram. On the bundled examples this cuts total edge length in the default view by about 6% and removes three crossings, with the widest single improvement being 42%. Grouped views are unchanged. Refs #2365 (#2330).
