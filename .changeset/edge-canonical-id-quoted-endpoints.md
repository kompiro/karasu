---
"@karasu-tools/core": patch
"karasu": patch
---

An edge's canonical id now quotes an endpoint that `.krs.style` cannot read as one identifier, the way `.krs` does: `"a b" -> c` is `edge#"a b"->c`, `a -> "b->c"` is `edge#a->"b->c"`, `"a-" -> c` is `edge#"a-"->c`. The rule the app's right-click direction menu writes for such an edge now parses and applies, and edges whose endpoints differ no longer get a false `ambiguous-edge-base` warning. `edge#`, `edge[from=]` and `edge[to=]` accept string-literal endpoints and normalize them, so `edge#"a"->c` is `edge#a->c`. Ids made of identifiers are unchanged. `edgeBaseId`, facet-overview edge ids and the `facet-not-declared` subject use the same quoted form, and the `ambiguous-edge-base` message shows the base as `edge#<base>`. Two existing rules change target: `edge#a-->c` no longer matches a sync edge from a quoted `"a-"` (write `edge#"a-"->c`), and a spaced `edge#a- -> c` now means that sync edge instead of the async `a --> c`. `karasu fmt` writes selectors in the normalized form, so `edge#a->#abc` becomes `edge#a->"#abc"` and `edge[from=#abc]` becomes `edge[from="#abc"]`; they match the same edges (#3480).
