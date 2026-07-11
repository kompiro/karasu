---
"@karasu-tools/core": minor
"karasu": minor
---

Add an opt-in `groupBy: "team"` system-view render option (#1858, P2a slice A). When set, nodes are bucketed into their owning team (from the `organization`/`owns` block), the teams are stacked in dependency order (min feedback-arc-set), and each team is enclosed in a boundary frame. Omitting the option leaves the default kind-tier layout byte-for-byte unchanged.
