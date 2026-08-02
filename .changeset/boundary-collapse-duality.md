---
"@karasu-tools/core": minor
"karasu": minor
---

Collapsing one `boundary` no longer hides a node that also belongs to another,
still-expanded one (#2180). A node folds only when every boundary it belongs to
on that canvas is collapsed, and it folds once — into the group it was placed
in. A collapsed boundary whose members all stayed visible draws no stub at all
instead of `<Boundary> (0)`.
