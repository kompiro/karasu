---
"@karasu-tools/core": minor
"karasu": minor
---

`realizes` now accepts a comma-separated list of targets on one line (`realizes OrderService, InventoryService`), as sugar for repeated `realizes` lines. Both forms produce the same model and may be mixed within a deploy unit; `karasu fmt` keeps emitting one target per line. A malformed list (`realizes A,` / `realizes ,B`) now reports a single `expected-property-value` instead of the generic `unexpected-token-in-block`, and an unresolved target is reported at its own identifier rather than at the whole deploy node.

The AST type `DeployNodeProperties.realizes` changes from `string[]` to `RealizesTarget[]` (`{ id, loc }`) to carry those per-target ranges. Callers reading `properties.realizes` directly need `.map(t => t.id)`; the compiled `NodeMetadata.realizes` is unchanged and stays `string[]`. See #2167.
