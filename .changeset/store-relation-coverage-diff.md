---
"@karasu-tools/core": minor
"karasu": minor
---

`karasu coverage` now diffs, per `database`, the table relations the `.krs`
records against the entity relations projected onto that store. Four new
`InfraCoverage` lists of ordered `{from, to}` leaf pairs:
`recordedWithoutProjection` (the store states a relation the logical model
lacks), `projectionWithoutRecorded` (application-level integrity, reported as a
fact), `directionMismatch` and `kindMismatch` (disagreements the canvas resolves
toward the recorded side). Shown as a table in the markdown output and carried
through `--format json`. Slice C of #2585 (#2723).
