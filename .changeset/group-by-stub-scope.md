---
"@karasu-tools/core": patch
"karasu": patch
---

Refine the multi-system Group-by-team fix (#1884): collapsed-team stub ids in
the multi-system root view are now namespaced by system id at generation
(`__group_collapsed_<sys>_<team>__`) instead of being de-collided by a post-hoc
rewrite. A team spanning systems keeps one stub per system by construction.
Single-system output is unchanged.
