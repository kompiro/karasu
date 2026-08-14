---
"@karasu-tools/core": minor
"karasu": minor
---

Group frames ("Group by" team / boundary) now show the group's declared `label` as the frame title, falling back to the group id when no label is given. The frame container id stays `__group_<id>__`, so collapse state and permalinks are unchanged. The positional label form (`<kw> <id> "<label>"`) is retired per ADR-19: `boundary` now rejects it with the `positional-label-removed` error (experimental construct, no deprecation window). The same form on `organization` / `team` / `member` is covered by its own entry — it was deprecated here and removed in #2208 before either shipped, so no release ever emitted the intermediate warning. (#2133)
