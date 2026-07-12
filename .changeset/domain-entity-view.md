---
"@karasu-tools/core": minor
"karasu": minor
---

Add a per-domain **entity view** to the all-views bundle. A domain that owns `entity` nodes now renders a dedicated view of its entities and relations, reachable via the `#krs-entity-<domainId>` fragment; cross-domain relation targets appear as muted ghost nodes so the domain boundary is visible. Entities render with their own default style (distinct from usecases) and are kept out of the domain's usecase view. The interactive usecase/entity toggle and `resource` → entity resolution follow in later PRs (#1870).
