---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu translate --from db` now replays a migration history in order: `DROP TABLE` removes a table and `ALTER TABLE … RENAME TO` or MySQL's `RENAME TABLE` renames it (foreign keys follow), statements inside comments are skipped, so dropped tables and the temporaries of a table rebuild are no longer emitted (#3182).
