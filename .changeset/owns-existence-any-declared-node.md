---
"@karasu-tools/core": patch
"karasu": patch
---

Report one code, not two, when a team owns something it cannot own. `owns U` on a declared `user` (or `usecase` / `entity` / `resource`) used to draw both `owns-target-not-found` and `invalid-owns`, because the existence check filtered its id set by ownable kind and read "no such ownable node" as "not found". Existence now asks only whether a node with that id exists, so every kind refusal comes from `invalid-owns` alone, and its message names the kind it refused instead of claiming no service or domain has that id.

Owning a `system` id changes verdict rather than count: it drew `owns-target-not-found` before and now draws `invalid-owns` naming `system`, because a system does exist and refusing it by kind is the accurate thing to say (#2442).
