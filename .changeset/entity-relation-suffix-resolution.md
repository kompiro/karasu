---
"@karasu-tools/core": patch
"karasu": patch
---

Cross-domain entity relations resolve by the shared suffix rule (#2088 slice D1, #2575): when two domains share an id, a qualified relation now resolves to the domain that actually declares the referenced entity, instead of being silently dropped because the first-declared domain occupied the lookup slot.
