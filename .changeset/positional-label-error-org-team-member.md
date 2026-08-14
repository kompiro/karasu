---
"@karasu-tools/core": minor
"karasu": minor
---

The positional label form (`<kw> <id> "<label>"`) on `organization` / `team` / `member` is now the `positional-label-removed` error, finishing ADR-19 (#2208). Write `label "..."` inside the block instead. The string is still read as the label, so an org chart keeps its names while the file is fixed. **Run `karasu fmt` before upgrading**: it rewrites the form into the property form, but only while the form still parses without an error. (#2208)
