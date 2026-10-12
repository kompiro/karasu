---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

Static SVG exports (`karasu render`, the drill-down and all-views bundles) now emit one `#krs-system-<id>` / `#krs-entity-<id>` level per id. When two nodes share an id, the level shows the node the app opens for the same anchor (the `@migration_target`-first winner), and a later system's nodes are drawn from their own content instead of copying the first system's. The stacked all-layers export labels each band with its own system. (#2933)
