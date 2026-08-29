---
"@karasu-tools/core": minor
"karasu": minor
---

Edge endpoints now accept and resolve qualified paths at any depth: `A -> Shop.Checkout.Payment` parses, resolves to exactly that node, and renders as a ghost inside the target's top-level system with the intermediate path shown beneath the card. Reach is decided by structure rather than spelling — a qualified endpoint's candidates are narrowed to those descending from a node the declaring scope can see, so bare endpoints keep their peer binding and every existing model's diagnostics are unchanged. A qualified endpoint that reaches nodes of mixed kind or depth reports the new `edge-target-ambiguous` warning. Lifting the parser's two-segment cap also unlocks deep qualifiers on entity relations. Slice E of #2088; closes #2577.
