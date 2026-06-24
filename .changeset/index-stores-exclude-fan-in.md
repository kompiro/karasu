---
"karasu": minor
---

`[index]` stores are now excluded from shared-infra-fan-in detection. Because a derived index is expected to be fed from a source of truth, fan-in into an `[index]` store is no longer flagged as shared-infrastructure coupling, refining the diagnostic introduced for the `[index]` tag. See #1741.
