---
"@karasu-tools/core": patch
---

system view: keep an `[external]` service on the side its own consuming hubs are on when every hub sits on one half of the diagram. The side split compared each external against the median of the hub barycenters, which always lands inside the set and so split it whatever the hubs were doing — stranding the lowest external in the far column with its edge crossing the whole figure. The median is now used only when the barycenters straddle the content centre, which is the case it was chosen for (separating two hubs' fans, ADR-1728). Diagrams whose hubs straddle the centre are unchanged.
