---
"@karasu-tools/core": patch
"karasu": patch
---

Route an edge that spans several rows through the columns between the cards
instead of out to a gutter. An interior corridor is now reached the way a
gutter route is — a side stub when that is clear, a top/bottom port and the
inter-row channel when a sibling blocks it — and an edge whose endpoints are
rows apart may take one gap of every row in between. Where a row leaves no
column at all, one is reserved and the placement is run once more, within the
existing two-pass bound. Measured on a 10k-line reverse-engineered model
(20 views, 1,102 edges): edges leaving the content for a gutter 987 → 597,
segment crossings −18.7%, route length −13.0%, canvas area −9.7%, and
collinear overlapping segment pairs 3 horizontal / 13 vertical → **0 / 0**.
