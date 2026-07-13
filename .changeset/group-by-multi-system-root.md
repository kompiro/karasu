---
"@karasu-tools/core": patch
"karasu": patch
---

Fix: `groupBy: "team"` (and `collapsedGroups`) is now applied in the multi-system
root view, not only when focused on a single system. Previously the multi-system
layout branch silently dropped these options, so team boundary frames and
per-team collapse disappeared as soon as a model had two or more systems — which
coincided with the presence of a cross-system (ghost) edge. Grouping is applied
per-(system, team): a team that owns members in two systems is framed once inside
each system. (#1884)
