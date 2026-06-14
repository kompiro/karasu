---
"karasu": minor
---

Add the `unresolved-edge-endpoint` warning. When an edge references a node id that exists nowhere in the merged model, the edge is dropped during rendering (the resolved endpoint is kept) — this previously happened silently. `karasu render` now surfaces it as a warning naming the unknown id and the edge. Cross-system dotted refs (`Sys.Svc`) keep their existing `cross-system-ref-*` handling, and the warning is suppressed in the single-document LSP context where imports are unresolved.
