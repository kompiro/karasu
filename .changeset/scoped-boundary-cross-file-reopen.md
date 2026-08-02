---
"@karasu-tools/core": patch
"karasu": patch
---

A `boundary` declared inside a `system` (or a `database` / `queue` / `storage`)
that another file reopens now reaches the merged model instead of being silently
dropped (#2246) — it frames its members like any other scoped boundary. Two
files declaring the same boundary id in one scope now report
`duplicate-boundary-id` once, decided on the merged model.
