---
"@karasu-tools/core": minor
"karasu": minor
---

Add the builtin store-role tags `[cache]` / `[analytics]` and the lifecycle annotation `@planned` (#2172).

`[cache]` (a store you could rebuild — a session store, a CDN origin cache) and `[analytics]` (a warehouse / data lake) apply to `database` and `storage`, and join `[index]` on one axis: which way this store is not the system of record. All three are now out of scope for the shared-store diagnostics (`shared-infra-fan-in`, `cross-domain-store-access`), which describe a shared *system of record*. `@planned` marks an element the design places but that does not exist yet.

Behaviour changes to expect:

- A model already using `[cache]`, `[analytics]` or `@planned` stops warning and starts rendering a badge. Using any of the three on a kind outside its `appliesTo` (`service Api [cache]`) now warns as `tag-not-applicable`.
- `karasu translate --from wrangler` emits `database <id> [cache]` for a KV namespace instead of a bare `database`, closing the degrade recorded in ADR-1935.
- Opening a model that uses the new names with an older karasu warns them as `tag-not-builtin` / `annotation-not-builtin`.

The review also rejected `[kv]`, `[bff]`, `[graph]`, `[timeseries]`, `[replica]`, `@canary` and `@sunset`; those keep warning, with the reasons recorded.
