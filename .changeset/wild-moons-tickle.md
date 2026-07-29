---
"@karasu-tools/core": patch
"karasu": patch
---

Fix the Reference panel's node-kind catalog, which had drifted from the parser (#2158): `client` now lists `capability`, `resource` lists `operations`, the `entity` kind is present (it was missing from the panel and from the generated `docs/spec/syntax.md` table), and `service` / `domain` no longer advertise `team` — a property ADR-14 removed that is now a parse error. A new parser-driven test keeps the catalog and the parser in agreement in both directions (TPL-20260729-01).
