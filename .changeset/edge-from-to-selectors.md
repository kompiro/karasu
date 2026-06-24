---
"@karasu-tools/core": minor
"karasu": minor
---

Add `edge[from=<id>]` / `edge[to=<id>]` source/target edge style selectors

`.krs.style` can now color a node's whole fan-out (or fan-in) in one rule —
`edge[from=ApiGateway] { color: #3B82F6; }` matches every edge originating at
`ApiGateway`, and `edge[to=X]` matches every edge terminating at `X`. `<id>`
accepts dot-notation endpoints for synthesized usecase→resource edges, and
both selectors score 11 (same tier as `edge[<tag>]`). An attribute other than
`from` / `to` raises an `unknown-edge-selector-attribute` error.
