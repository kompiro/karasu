---
"@karasu-tools/core": minor
"karasu": minor
---

System view: collapsing an external/infra layer now **re-targets** its
boundary-crossing edges onto the `⊕` stub instead of dropping them, matching how
team-group collapse already behaves (#1872 / ADR-20260712-01). Folding the
external/infra layers — including via "Collapse all" — keeps the "who depends on
the external/infra layer" edges as aggregation trunks to the stub, so the
compact overview still shows the dependency structure.
