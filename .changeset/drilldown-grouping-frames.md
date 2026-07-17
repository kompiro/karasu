---
"@karasu-tools/core": minor
"karasu": minor
---

Grouped exports now draw group frames on drill-down levels, for both Group-by axes (#1983). Grouping resolves per view, against the nodes rendered at the level being drawn: the Show All Layers / drill-down / Open All Views exports frame each level's own members (previously root-level only), and the entity view accepts a new optional `groupBy` argument (`renderEntityView`) so entity members are framed there too. Ungrouped output stays byte-identical, and levels without members keep their exact previous layout. For the stable team axis (`organization` / `owns`) this changes grouped exports of models that own nested domains; the experimental `boundary` axis gains the same per-level frames (still experimental — no compatibility promise, stable promotion remains gated on real-usage evidence).
