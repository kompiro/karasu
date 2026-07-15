---
"@karasu-tools/core": minor
"karasu": minor
---

`translate --from db` now scaffolds conceptual entities and relations. In the
default (aggregate) granularity, after the physical `database` block it emits a
provisional per-database `domain` with one `entity` per aggregate root (mapped
to its table). Cross-aggregate FK links become entity relations; a relation
derived purely from a Soft FK (a `<stem>_id` / `<stem>_code` column with no
declared `REFERENCES`) carries the new auto-assigned `[inferred]` tag, while an
explicit FK leaves it untagged (confirmed). `[inferred]` renders in a muted
grey, orthogonal to `[sync]` / `[async]` line style. `--granularity table` is
unchanged. Refs #1909, #1870.
