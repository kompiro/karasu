---
"@karasu-tools/core": minor
"karasu": minor
---

Add `renderEntityView(krsSource, viewPath, …)` — the live, single-level render of a domain's **entity view** (its entities and intra-domain relations), the interactive counterpart to the static `#krs-entity-<domainId>` bundle level. The share `ShareTarget` gains an `entityView` boolean so a deep-link can address the entity sub-mode of a drilled domain. In the app the entity view is now reachable via an **Entities** toggle in the system view and is carried in the URL hash as `#krs-entity-<domainId>` (#1907, follows #1870/#1896).
