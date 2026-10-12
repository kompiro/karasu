---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

When two systems declare a node with the same id (`Shop.Api` and `Admin.Api`), each card is now drawn with its own style, `column` hint, facet ring and compare-mode state instead of one taken from its namesake, and the draw.io root page gives each card its own cell with its own system's edges (#2934). Lookups by bare id (`nodeMetadata`, `nodeFileIndex`, the style entry a ghost card reads) all answer with the same node, the `nodePathIndex` winner, and new path-keyed maps (`nodeFileIndexByPath`, `facetIndexByPath`, `nodePathRanking`, `ResolvedStyles.nodesByPath`, `nodeDiffByPath`) hold every node's own value. Models without a shared id render as before, except that the draw.io root page of a multi-system model now names its cells by path (`system-Shop_Api`).
