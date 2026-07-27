---
"@karasu-tools/core": minor
"karasu": minor
---

Group frames ("Group by" team / boundary) now show the group's declared `label` as the frame title, falling back to the group id when no label is given. The frame container id stays `__group_<id>__`, so collapse state and permalinks are unchanged. The positional label form (`<kw> <id> "<label>"`) is retired per ADR-19: `boundary` now rejects it with the `positional-label-removed` error (experimental construct, no deprecation window), while `organization` / `team` / `member` still accept it but emit the `positional-label-deprecated` warning — `karasu fmt` rewrites it to the `label` property. (#2133)
