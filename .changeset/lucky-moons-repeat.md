---
"@karasu-tools/core": patch
"karasu": patch
---

Report a deploy unit id declared twice in one `deploy` block, and stop a container from reserving a grid cell for a unit it will not draw (#2713). `duplicate-node-in-deploy` previously fired only when a wildcard import merged the collision; a single file, and both named-import routes, said nothing.
