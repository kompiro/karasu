---
"@karasu-tools/core": minor
"karasu": minor
---

Edge endpoints now accept and resolve qualified paths at any depth: `A -> Shop.Checkout.Payment` parses, resolves to exactly that node, and renders as a ghost inside the target's top-level system with the intermediate path shown beneath the card. Lifting the parser's two-segment cap also unlocks deep qualifiers on entity relations.

Reach is decided by structure rather than spelling: a qualified endpoint must spell the whole path from a top-level `system` down to the target, which is the same condition the renderer can draw. Bare endpoints keep their peer binding, and existing qualified endpoints already spell a whole path, so they resolve exactly as before. A reference that is only a fragment (`Checkout.Payment`) is now reported with the spelling to use instead.

Two diagnostics move on existing models. `edge-target-ambiguous` is new, drawn when a qualified endpoint matches nodes of mixed kind or depth — reachable when two `system` blocks in one file share an id. And a qualified endpoint rooted at a top-level orphan rather than a `system` now reports `edge-endpoint-not-at-scope`, naming the spelling to use, where it previously reported `cross-system-ref-unresolved`.

Slice E of #2088; closes #2577.
