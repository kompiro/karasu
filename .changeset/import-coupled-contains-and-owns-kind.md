---
"@karasu-tools/core": patch
"karasu": patch
---

Stop two owns/contains diagnostics from false-firing in the editor on ordinary cross-file models. `contains-target-not-found` now declines to decide in a document that still has imports to resolve, the way `owns-target-not-found` already did — the member may be declared in an imported file, and a cross-file `system` reopen can add the child a scoped `contains` names. `invalid-owns` now reports only what its name says: a target that **resolves to a node** of an unownable kind. An id that resolves to nothing is `owns-target-not-found`'s verdict alone, so a typo no longer draws two warnings, and a cross-file target draws none in a single-document context (#2410).
