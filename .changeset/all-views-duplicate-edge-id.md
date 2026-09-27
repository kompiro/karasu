---
"@karasu-tools/core": patch
"karasu": patch
---

`buildAllViewsSvgProject` (behind the default `karasu render`) now raises `duplicate-edge-id`. It previously skipped the project-wide edge id check, so `karasu render index.krs` accepted a model that `karasu render --view system` rejected. The source-level `buildAllViewsSvg` is unchanged, so the karasu-nest gallery and the app's share render still treat duplicate edge ids as the author's call.
