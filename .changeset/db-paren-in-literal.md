---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu translate --from db` no longer reads a `)` or `,` inside quoted text as part of the table definition, so `DEFAULT ')'` or `DEFAULT 'a, b'` no longer cuts a `CREATE TABLE` short, invents columns, or replays a statement written inside the literal (#3282).
