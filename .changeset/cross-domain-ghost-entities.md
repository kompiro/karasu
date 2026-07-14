---
"@karasu-tools/core": minor
"karasu": minor
---

Entity view now surfaces **cross-domain relations** as muted **ghost** entities. A relation targeting a qualified `DomainId.EntityId` (e.g. `Order -> Customers.Customer`) draws the foreign entity faded — both outgoing (this domain → foreign) and incoming (foreign → this domain) — sub-labelled with its owning domain, reusing the existing ghost mechanism. Qualified targets are required because entity ids are only warning-level unique; a bare id stays intra-domain only. (#1911, follows #1870/#1896/#1919)
