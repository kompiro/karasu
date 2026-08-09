---
"@karasu-tools/core": minor
"karasu": minor
---

Raise the supported Node.js floor from `>=20` to `>=22`. Node 20 reached end of life on 2026-04-30, so `engines.node: ">=20"` advertised a runtime that no longer receives security fixes. Node 22 is supported through 2027-04. The CLI bundle is now compiled with `--target=node22` to match. See Issue #2397.
