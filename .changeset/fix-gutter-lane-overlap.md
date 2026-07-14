---
"@karasu-tools/core": patch
"karasu": patch
---

fix(core): stop distinct edges overlapping in the expanded "Group by" view (#1927, follow-up to #1859 P2c-B). Single-incoming gutter edges now get their own lane so two corridors no longer render as one collinear vertical line (a false connection), and the edges leaving **or entering** one node on the same side are fanned across the node's edge so their horizontal stubs no longer overlap into one line (this also fixes an incoming edge sitting on an outgoing edge when a team is collapsed). Trunk siblings keep their shared merge entry; lanes stay clear of aggregation-trunk lanes; every route stays outside all cards/frames (no node/frame penetration).
