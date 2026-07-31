---
"@karasu-tools/core": minor
"karasu": minor
---

Report edges that render on no view: a new `edge-endpoint-not-at-scope` warning fires when an edge names an endpoint that exists in the model but is not a peer at the scope where the edge is declared — e.g. `A -> B` written at `system` scope where `A` and `B` are domains inside a service. Previously such an edge parsed, was seen by the circular-dependency check, and then silently disappeared from every diagram. Placements that do render (a `domain` → `domain` dependency at any distance, a qualified cross-domain `entity` relation) are unaffected. See #2075 and `docs/spec/syntax.md` § Endpoint scope.
