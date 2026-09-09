---
"@karasu-tools/core": patch
"karasu": patch
---

Keep the edges declared in a reopened infra block's body. Merging the same
`database` / `queue` / `storage` id across files unioned its leaves but dropped
`sessions -> users` written in the block body, so a store declared in two files
kept its tables and silently lost the relations between them (#2754).
