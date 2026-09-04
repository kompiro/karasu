---
"@karasu-tools/core": patch
"karasu": patch
---

Decide node-id multiplicity on the merged model. `nodePathIndex` was the last derived index the import resolver merged with a first-file-wins union, so `node-id-multiple-locations` went silent across files and a bare-id permalink resolved to whichever file merged first: a `@migration_target` service in an imported file lost the index entry to the `@deprecated` one it was replacing. Nodes brought in by a named import now get an index entry too, so deep links to them resolve. See #2596.
