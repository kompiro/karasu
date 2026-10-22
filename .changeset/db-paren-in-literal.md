---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu translate --from db` no longer reads quoted text as part of a table definition: a `)` or `,` inside it (`DEFAULT ')'`, `DEFAULT 'a, b'`) no longer cuts a `CREATE TABLE` short, invents columns, or replays a statement written inside the literal, and `PRIMARY KEY` / `REFERENCES` inside a string literal no longer declare a key or a foreign key (#3282).
