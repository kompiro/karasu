---
"@karasu-tools/core": minor
"karasu": minor
---

Scoped `boundary` declarations (experimental, #2036) now carry a scope-qualified group identity: a same-named boundary declared in another scope is a different boundary — its frame, label, and collapse state are independent per scope, and its collapse stub is titled with the bare boundary id. Top-level boundaries are unchanged (one declaration, one shared collapse state across levels). Also documents the scoped form in the syntax spec and ships a `scoped-boundary.krs` feature sample.
