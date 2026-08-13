---
"@karasu-tools/core": patch
"karasu": patch
---

Separate parallel edges between two services expanded in place. A sync and an
async edge (or two labelled edges) between the same pair used to be drawn on
identical coordinates once both endpoints were expanded frames, so only the
last one was visible. Bundling now offsets any bundle whose ports were never
distributed, instead of only ghost and cyclic edges
([#2477](https://github.com/kompiro/karasu/issues/2477)).
