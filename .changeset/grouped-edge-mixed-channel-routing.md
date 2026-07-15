---
"@karasu-tools/core": patch
"karasu": patch
---

Fix grouped (Group by → Team) system-view edges that ran straight through node cards when a plain side-gutter reroute was blocked on both sides — a flanked infra target or an actor-row-blocked source (#1954). Such edges now take a mixed route: a side stub on the clear endpoint and a top/bottom inter-row channel detour on the blocked one. The #1927 lane-separation and port fan-out passes were generalized to cover these routes, so the fix reaches zero node/frame penetration and zero collinear overlap together (verified on `examples/en/getting-started`).
