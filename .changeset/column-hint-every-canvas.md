---
"@karasu-tools/core": patch
"karasu": patch
---

The `column: left | right` style hint now orders cards on every logical canvas, as ADR-969 and the style spec describe. It used to be applied only on system views that have users, clients, infra or external services, so a system view of plain services and every drill-down ignored it.
