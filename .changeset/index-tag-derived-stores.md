---
"karasu": minor
---

Add the `[index]` tag for derived search / vector-index databases. A `database`, `queue`, or `storage` block tagged `[index]` is recognized as a read-optimized projection built from a source of truth, letting karasu distinguish derived indexes from primary stores in the system and deploy views. See #1727.
