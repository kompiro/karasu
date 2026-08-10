---
"@karasu-tools/core": patch
"karasu": patch
---

Stop warning `invalid-owns` when a team owns a `database` / `queue` / `storage`. Infra blocks are owns targets per the spec, and the existence check already accepted them, so `team backend { owns OrderDB }` drew a warning saying the kind cannot be owned while nothing else objected. Both owns checks now read one shared kind enumeration (`OWNS_TARGET_KINDS`), and infra nested inside a `system` counts the same as a top-level block. An infra leaf (`table` / `queue-item` / `bucket`) and a `capability` are still rejected (#2408).
