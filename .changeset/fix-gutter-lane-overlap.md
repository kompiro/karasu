---
"@karasu-tools/core": patch
"karasu": patch
---

fix(core): give single-incoming edges in the expanded "Group by" view their own gutter lane so two distinct edges no longer render as one overlapping (collinear) vertical corridor — previously they read as a false connection (#1927, follow-up to #1859 P2c-B). Lanes stay clear of aggregation-trunk lanes and outside every card/frame (no node/frame penetration).
