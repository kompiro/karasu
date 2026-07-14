---
"@karasu-tools/core": minor
"karasu": minor
---

Add `karasu translate --from wrangler`: extract a Cloudflare Workers app's physical layer from its `wrangler.toml`. Emits an engine-neutral logical `system` (the Worker `service`, binding-derived `database` / `storage` / `queue` infra, and edges) plus a physical `deploy` where the concrete Cloudflare technology lands in `store { type ... }` — never in a logical label. Mapping: D1 → `database`, R2 → `storage`, Queues → `queue`, Vectorize → `database [index]`, KV → `database`, Workers AI / Durable Objects → `service [external]`, service bindings → communication edges. Unknown bindings are skipped with a warning. The App's translate dialog gains a "Cloudflare wrangler.toml" option. See #1943.
