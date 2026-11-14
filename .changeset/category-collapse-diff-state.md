---
"@karasu-tools/core": patch
"karasu": patch
---

Compare mode: an edge into a collapsed `External (N)` or `Infra (N)` stub now keeps the diff state of the edges it stands for (`added`, `removed`, or `changed` for a mix) instead of drawing undecorated, the way a collapsed team's stub edges already did. On the multi-system root, a collapsed stub edge now takes its state from its own system only, so an identical edge changed in another system no longer decorates it (TPL-1886).
