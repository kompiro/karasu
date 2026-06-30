---
"@karasu-tools/core": minor
"karasu": minor
---

Add deep permalink support (#1827): `SharePayload` gains an optional `target`
(view / leaf node / highlight / orgTree) so a shared nest URL opens drilled and
focused on a specific element/view instead of the whole model. A new `anchorId`
helper centralizes the `krs-<view>-<id>` element-anchor grammar used by the
static drill-down SVG and the app history hash for the drillable system/org
views (contract: `docs/spec/permalink.md`).
