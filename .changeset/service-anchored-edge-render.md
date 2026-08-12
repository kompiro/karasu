---
"@karasu-tools/core": patch
"karasu": patch
---

Render edges declared inside a `service` block. `service S1 { S1 -> S2 }` is the
spelling the edge origin scope rule asks for, but it used to render on no view
at all for any target; it now draws wherever the declaring service is a node
(system view, system drill-down, the `Unassigned` frame), and a qualified target
feeds the same ghost-system path as the `system`-scope spelling. The
`edge-endpoint-not-at-scope` warning stops firing for the placements that now
render ([#2223](https://github.com/kompiro/karasu/issues/2223)).
