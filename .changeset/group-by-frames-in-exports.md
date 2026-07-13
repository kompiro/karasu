---
"@karasu-tools/core": minor
"karasu": minor
---

Render "Group by: team" boundary frames in the export / secondary system-view
SVGs — Show All Layers, drill-down export, and Open & Export All Views — when
the viewer has grouping active. Exports keep the **full structure** (collapse is
never applied there by design); the root system-view level is grouped into team
bands with boundary frames while every node stays drawn. Threads `groupBy`
through `buildAllLayersSvg` / `buildDrillDownSvg` / `buildAllViewsSvg`
(#1879, ADR-20260711-03).
