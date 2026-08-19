---
"@karasu-tools/core": minor
"karasu": minor
---

The positional label form (`<kw> <id> "<label>"`) on `organization` / `team` / `member` is now the `positional-label-removed` error, finishing ADR-19 (#2208). Write `label "..."` inside the block instead. Like any error, it stops the diagram from being drawn until the file is fixed — the app keeps showing the last valid render, and `karasu render` / `karasu subtree` exit 1. **Run `karasu fmt` before upgrading**: it rewrites the form into the property form, but only while the form still parses without an error. (#2208)
