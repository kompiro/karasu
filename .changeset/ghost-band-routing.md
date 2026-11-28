---
"@karasu-tools/core": minor
"karasu": minor
---

Ghost band connectors in entity views and service views are now routed like any other edge instead of drawn as straight lines: they go around cards and band frames, take their own lanes, and carry hop marks at crossings. They are routed after the canvas's own edges, so the focused frame and its routes stay where they are; a band line that crosses one of them can keep a two-way pair drawn as two lines, as any crossing does (#3881, #2823).
