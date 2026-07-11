---
"@karasu-tools/core": patch
"karasu": patch
---

Group-by (`groupBy: "team"`) now keeps the overall user → client → service → infra → external flow: team bands occupy the service tier's slot, with actors/clients above and un-owned services, infra and external below, instead of pushing every un-grouped node beneath the team bands (#1858).
