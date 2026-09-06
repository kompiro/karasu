---
"@karasu-tools/core": minor
"karasu": minor
---

Choose the gutter side by free capacity and detour length instead of a fixed
right-first order (#2610). Edges that cannot take an interior corridor spread
over both gutters, and the side is decided by geometry, not by where in the file
an edge was declared. Every edge attached to a node side is fanned out together,
so a rerouted edge no longer lands on a port another edge still uses.
