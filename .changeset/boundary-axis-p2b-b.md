---
"@karasu-tools/core": minor
"karasu": minor
---

Wire the experimental **"Group by: boundary"** axis (P2b-B). The declared
`boundary` blocks from P2b-A now group the system view: selecting the boundary
axis bands nodes by their `boundary` and draws a boundary frame per group,
reusing the P2a/P2c grouping machinery (two-level layout, collapse, orthogonal
routing). The boundary axis is independent of and exclusive with the team
(`owns`) axis — `ownerIndex` remains the per-card team badge regardless of axis.
In the app the Group-by selector shows the "Boundary" option only when the model
declares a `boundary` (data-driven visibility, mirroring the "Team" option's
`organization` gate). Experimental notation (ADR-20260713-01). Refs #1822.
