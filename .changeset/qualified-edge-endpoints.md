---
"@karasu-tools/core": minor
"karasu": minor
---

Edge endpoints now accept and resolve qualified paths at any depth: `A -> Shop.Checkout.Payment` parses, resolves to exactly that node, and renders as a ghost inside the target's top-level system with the intermediate path shown beneath the card. Reach is decided by structure rather than spelling — a qualified endpoint must be anchored at a top-level root, spelling the whole path from a `system` down to the target, so bare endpoints keep their peer binding and existing qualified endpoints, being root-anchored already, resolve exactly as before. The one addition on an existing model is `edge-target-ambiguous`, which a qualified endpoint can now draw when it matches nodes of mixed kind or depth — reachable when two `system` blocks in one file share an id. A reference that is only a fragment (`Checkout.Payment`) is reported with the anchored spelling to use instead. A qualified endpoint that reaches nodes of mixed kind or depth reports the new `edge-target-ambiguous` warning. Lifting the parser's two-segment cap also unlocks deep qualifiers on entity relations. Slice E of #2088; closes #2577.
