---
"@karasu-tools/core": minor
"karasu": minor
---

Group by team (system view): draw circuit-diagram crossing marks so a crossing can no longer be misread as a connection (#1859 P2c-C). Where a horizontal edge segment crosses a vertical (gutter corridor / trunk spine) at a right angle it now arcs over it (hop = "not connected"); aggregation-trunk merge points get a junction dot (= "connected"). Marks are derived from final coordinates, so they are deterministic. Ungrouped ("Group by: none") output is unchanged.
