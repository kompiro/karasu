---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu translate --from wrangler` no longer hides a Durable Object's class name when it matches the Worker's name: the service is declared as `<Class>Object` with `label "<Class> (Durable Object)"` instead of `<Class>2` (#3183).
