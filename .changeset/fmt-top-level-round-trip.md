---
"@karasu-tools/core": patch
"karasu": patch
---

Fix `karasu fmt` silently deleting top-level constructs. `boundary`, `legend`, `client`, `database`, `queue` and `storage` blocks declared at the top level were parsed and rendered but dropped by the formatter — a file made only of top-level infra blocks (the shape `karasu translate --from db` emits) formatted to an empty file. All top-level constructs now round-trip. Closes #2076; see ADR-20260720-02.
