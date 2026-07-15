---
"@karasu-tools/core": minor
"karasu": minor
---

Add the `cross-domain-store-access` info diagnostic: a usecase in one domain that reads/writes an infra leaf owned by another domain is surfaced as an informational boundary-crossing fact. Ownership is derived from `entity` mappings (no new syntax), keyed at leaf granularity, held as a set of owning domains, scoped per system, with `[external]` / `[index]` stores excluded. Orthogonal to `shared-infra-fan-in` (#1819).
