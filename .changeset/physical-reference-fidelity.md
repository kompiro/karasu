---
"@karasu-tools/core": minor
"karasu": minor
---

Report dangling physical references and measure physical-layer recovery (#2078).

Two new warnings, `unresolved-resource-ref` and `unresolved-table-ref`, fire when
a usecase's `resource <Infra>.<Leaf>` or an entity's `table <Infra>.<Leaf>` names
an infra block or leaf nothing declares; the message says which half is missing.
Until now the dotted form was taken as resolved on sight, so a model could
reference tables of a `database` block that had been deleted outright and still
render clean. `[external]` references are exempt, and the check is import-coupled
like `owns` / `contains`.

`karasu coverage` gains a `physical` section reporting, per infra block, how many
declared leaves an entity maps and a usecase reaches — separating leaves that are
referenced but unmapped from leaves nothing represents at all, plus the entities
carrying no table mapping. Per-domain `score` / `thin` values are unchanged.
