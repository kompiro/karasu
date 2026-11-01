---
"@karasu-tools/core": patch
"karasu": patch
---

Edges whose quoted ids contain `->` no longer stand in for each other in view extraction (#3111). Two implicit service edges such as `a → "b->c"` and `"a->b" → c` are both drawn instead of being merged into one. An explicit `a -> "b->c"` no longer hides an unrelated implicit `"a->b" → c`, and the two are no longer bundled as parallel edges. A caller ghost is drawn only on the container its reference resolves to (a domain `S.a.b` no longer shows up as a caller of `service "a.b"`), and same-id nodes under `system "Shop.x"` count separately toward `node-id-multiple-locations`.
