---
"@karasu-tools/core": patch
"karasu": patch
---

A deploy unit that names the same `realizes` target twice now declares one relation instead of two (#2552). The repeat is dropped wherever it sits — later in the same comma list or on a line of its own — and the unit joins that target's container once, so the container no longer reserves a grid cell for a unit that is drawn only once. Two refs that resolve to one node (`realizes Api` alongside `realizes Shop.Api`) stay two entries in the model, each keeping its own range for the reference diagnostics.
