---
"@karasu-tools/core": minor
"karasu": minor
---

Add a per-domain **entity view** to the all-views bundle. A domain that owns `entity` nodes now renders a dedicated view of its entities and their intra-domain relations, reachable via the `#krs-entity-<domainId>` fragment. Entities render with their own default style (distinct from usecases) and are kept out of the domain's usecase view; the entity views are fragment-only and do not rescale the shipped system/deploy/org views. The interactive usecase/entity toggle, cross-domain ghost entities, and `resource` → entity resolution follow in later PRs (#1870).
