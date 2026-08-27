---
"@karasu-tools/core": minor
"karasu": minor
---

`owns` and `contains` accept node reference paths (`owns Shop.Checkout.Payment`), resolved by the shared suffix rule (#2088 slice B, #2548): a bare id keeps its broadcast meaning, a longer path narrows to exactly the node it names, and multi-matches that mix kind or depth draw the new `owns-target-ambiguous` / `contains-target-ambiguous` warnings listing candidate full paths. `ownerIndex` and `boundaryMembership` are now keyed by node full path, and cross-file co-ownership is reported on the merged model (`duplicate-owner-assignment`).
