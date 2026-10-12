---
"@karasu-tools/core": patch
"karasu": patch
---

A path with no system segment now resolves as a top-level (Unassigned) node first. A top-level node that shares its id with a system's child can be drilled into from its card and opened by its permalink; previously the click opened the system's node and `#krs-system-<child>` showed an empty view (#3113). `resolveContainerChain` is exported so other readers of a view path resolve it the same way.
