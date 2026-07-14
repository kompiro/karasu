---
"@karasu-tools/core": patch
"karasu": patch
---

fix(core): stop distinct edges overlapping in the expanded "Group by" view (#1927, follow-up to #1859 P2c-B). Single-incoming gutter edges now get their own lane so two corridors no longer render as one collinear vertical line (a false connection), and the edges leaving one node on the same side are fanned across the node's edge so their horizontal stubs no longer overlap into one line at the source. Lanes stay clear of aggregation-trunk lanes and every route stays outside all cards/frames (no node/frame penetration).
