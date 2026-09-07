---
"@karasu-tools/core": minor
"karasu": minor
---

`translate --from db` now records each foreign key as a `table -> table` edge
inside the emitted `database` block (declared FKs untagged, Soft FKs
`[inferred]`; a folded child's FKs roll up to its aggregate root), so a schema
dump with no `entity` layer gets a store ER view straight away. The `database`
canvas unions these recorded edges with the projected entity relations: one
edge per pair, drawn as recorded, labelled from the relation when the record has
no label; an opposite-direction conflict draws the recorded side only. Slice B
of #2585 (#2722).
