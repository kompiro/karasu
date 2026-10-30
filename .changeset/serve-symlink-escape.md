---
"karasu": patch
---

`karasu serve` no longer returns files outside the served directory through a symlink: `/api/file/<name>` now resolves links and answers 404 when the target lies outside, and the `/api/*` endpoints no longer send `Access-Control-Allow-Origin: *`, so other web pages open in the browser cannot read them (#3283).
