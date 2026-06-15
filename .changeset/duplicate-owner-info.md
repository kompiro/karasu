---
"karasu": minor
---

`duplicate-owner-assignment` (the same node `owns`ed by more than one `team`) is now an **info** diagnostic instead of an error. Transient co-ownership during an inverse-Conway migration is a tolerated structural fact, surfaced like `domain-dispersal`; the first-declared team is kept as the node's primary owner. See ADR-20260615-01.
