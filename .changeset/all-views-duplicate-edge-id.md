---
"@karasu-tools/core": patch
"karasu": patch
---

The all-views compile (default `karasu render`, and `buildAllViewsSvg`) now raises `duplicate-edge-id`. It previously skipped the project-wide edge id check, so `karasu render index.krs` accepted a model that `karasu render --view system` rejected.
