---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A `system` named in `import { … }` is no longer drawn twice when the importing file already holds it, from a whole-file import of the same file, an earlier named import, or its own declaration. The block is reopened as a whole-file import does (#3801): children are merged, `label` / `description` follow the closest-to-entry rule with `system-property-conflict`, and a child id both declarations use is `duplicate-node-in-system`. A system first reached through a path import (`import { S.A.B }`) and then named whole now reports `duplicate-node-in-system` and keeps only the path-imported part of the colliding child, as the whole-file import of it already did (#3846). The syntax reference lists the kinds `owns` and `realizes` accept as a table generated from the code.
