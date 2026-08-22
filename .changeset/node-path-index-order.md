---
"@karasu-tools/core": patch
"karasu": patch
---

`node-id-multiple-locations` no longer depends on declaration order within a file (#2550): candidates are collected first and the verdict is decided afterwards. The warning is now a logical-layer verdict: it fires when two or more `service` / `domain` / `client` declarations share an id at different paths, while same names across the logical/physical boundary and within the physical layer (`database` / `queue` / `storage` and their sub-resources) are tolerated silently, physical references being dot-qualified. `nodePathIndex` keeps the `@migration_target`-priority winner (infra leaves inherit their block's annotations; ties keep the first declaration in traversal order), and parked (system-less) services and clients are now indexed and addressable. Fixes deep permalinks / viewPath silently resolving to the wrong node. Cross-file collisions still merge first-file-wins (#2596).
