---
"@karasu-tools/core": patch
"karasu": patch
---

Keep the edges into a collapsed `infra` / `external` category on the multi-system root view: they now re-target onto the category stub as aggregation trunks, the way the single-system view already did, instead of being dropped so the stub was drawn with nothing pointing at it (#2646). Each system also gets its own stub, so two systems folding the same category no longer collapse onto one card.
