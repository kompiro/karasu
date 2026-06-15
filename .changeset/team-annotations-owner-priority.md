---
"karasu": minor
---

`team` blocks now accept annotations (`team payments @migration_target(from: "legacy") { … }`), parsed into `TeamNode.annotations` / `annotationParams`. During an inverse-Conway handoff where a node is `owns`-ed by more than one team, the 1:1 `ownerIndex` now picks the `@migration_target` team as the primary owner (unmarked next, `@deprecated` last; ties keep the first declaration) — symmetric with the domain migration-coexistence rule on `nodePathIndex`. Co-ownership stays a tolerated fact via the `duplicate-owner-assignment` info diagnostic. `@migration_target` / `@deprecated` on a team also render as a badge in the organization view (grid, icon, and tree layouts), mirroring the system-diagram node badge. Closes #1583.
