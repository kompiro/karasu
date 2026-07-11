---
"@karasu-tools/core": minor
"karasu": minor
---

Add a `collapsedGroups` system-view render option (Issue #1858, P2a): with `groupBy: "team"`, a collapsed team folds to a `<Team> (N)` stub and its cross-group edges re-target onto the stub, so collapsing every team yields the compact group-dependency-DAG view. Intra-team edges drop and duplicate stub edges de-duplicate. Omit for the default fully-expanded grouped render.
