---
"karasu": minor
---

Migration-intent annotation params now have a consumer. A new core helper interprets a `@deprecated` / `@experimental` `until` value by precision — a date (`YYYY-MM-DD`), year-month (`YYYY-MM`), or quarter (`YYYY-Qn`) is machine-usable (a normalized lower-bound `sortKey` is exposed for sorting / filtering); any other string stays opaque and display-only. No "now" comparison is performed — `until` is recorded intent, not a runtime deadline (ADR-20260615-04). The node detail panel surfaces the interpreted `until` and the `@migration_target(from: …)` source. Follow-up to #1568; see #1595.
