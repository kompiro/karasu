---
"@karasu-tools/core": minor
"karasu": minor
---

Add the experimental `facet` construct: a top-level `facet <id> { label | description | link }` declaration for externally-defined sets (PCI scope, PII, "requires auth"), plus a `facets <id>[, <id>]*` property accepted on every node kind. Membership is 1:N, merges across imported files, and round-trips through `karasu fmt`. Two diagnostics come with it: `facet-not-declared` (warning) when a reference names no declaration — checked on the merged model, so a declaration in another file counts — and `duplicate-facet-id` (error) when the same id is declared twice. Default rendering is unchanged; the overlay, style selectors, and overview arrive in the follow-up slices of #2160. Refs #2173.
