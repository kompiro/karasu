---
"@karasu-tools/core": minor
"karasu": minor
---

`boundary` membership is now 1:N at the model layer (#2178, slice A of #2161).
A node listed in several boundaries keeps every declared membership instead of
only the first; the banded _Group by: boundary_ view still places it in its
first-declared boundary, so diagrams are unchanged. The
`duplicate-boundary-assignment` info diagnostic now states only the model fact
("belongs to more than one boundary") and no longer describes how a view
resolves it. A `boundary` declared in an imported file now reaches the importing
model, which it previously did not. TS API: `KrsFile.boundaryIndex` /
`scopedBoundaryIndex` become `boundaryMembership` / `scopedBoundaryMembership`
with array values, plus the new `primaryBoundaryOf` helper.
