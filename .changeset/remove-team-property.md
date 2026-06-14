---
"karasu": minor
---

Remove the deprecated `team` property on `service` / `domain`. Ownership is now declared solely with an `organization` block and `owns`; writing `team "..."` on a service or domain reports an error (`team-property-removed`). Team contact links move to the `team` block's `link` property. See ADR-20260614-01.
