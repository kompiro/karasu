---
"@karasu-tools/core": patch
"karasu": patch
---

Fix multi-view and all-layers diagrams being cropped to the top-left in the preview when larger than the pane. The composed root `<svg>` now carries a `viewBox` matching its `width`/`height`, so it scales responsively under `max-width/max-height: 100%` like single-view renders (#1790).
