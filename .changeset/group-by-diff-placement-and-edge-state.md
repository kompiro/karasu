---
"@karasu-tools/core": patch
"karasu": patch
---

Fix system-view "Group by: team" in compare/diff mode (#1886): a node removed in
the after-slice now renders inside its former team frame (grouping uses the merged
before ∪ after ownerIndex, after wins) instead of dropping to the trailing band,
and a wholesale-removed team draws an all-removed frame. Collapsed-team stub edges
keep their diff decoration — re-keyed onto the stub id and folded across the
aggregated originals (single state carries through, a mix reports `changed`).
