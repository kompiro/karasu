---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu fmt` now keeps annotation parameters. `@draft(confidence: "low")` came back as a bare `@draft` and `@deprecated(until: "2026-12-31")` as a bare `@deprecated`; on the organizational axis the annotation was dropped whole, so `team payments @migration_target(from: "legacy")` formatted to `team payments`. The parser read these and the compiler consumed them; only the formatter never emitted them, on the one command whose contract is "reformat, change nothing". A display-only value (`until` / `confidence`) emits quoted, a node reference (`from`) emits like every other reference. Closes #2571.
