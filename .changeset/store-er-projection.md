---
"@karasu-tools/core": minor
"karasu": minor
---

Draw `entity` relations on a `database` canvas. Drilling into a store now shows
table-to-table edges projected from entity relations whose both endpoints carry a
`table <Db>.<leaf>` mapping into that store, with no change to the `.krs`. Each
projected edge keeps the relation's label and `->` / `-->` kind and carries the
new system-assigned `[projected]` tag (colour only, sky blue by default), so it
reads apart from an edge the `.krs` records. Relations touching a tableless
entity, or spanning two stores, are not projected; the view is documented as
lossy. Slice A of #2585 (#2721).
