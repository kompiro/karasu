---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu translate --from db` now replays a migration history in order: `DROP TABLE` removes a table and `ALTER TABLE … RENAME TO` renames it (foreign keys follow), so dropped tables and the temporaries of a table rebuild are no longer emitted (#3182).
