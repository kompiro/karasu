---
"@karasu-tools/core": patch
"karasu": patch
---

Stop two owns/contains diagnostics from false-firing in the editor on ordinary cross-file models. `contains-target-not-found` now declines to decide in a document that still has imports to resolve, the way `owns-target-not-found` already did — the member may be declared in an imported file, and a cross-file `system` reopen can add the child a scoped `contains` names. `invalid-owns` now reports only what its name says: a target that **resolves to a node** of an unownable kind. An id that resolves to nothing is `owns-target-not-found`'s verdict alone, so a cross-file target draws nothing in a single-document context, and a plain typo draws one code instead of two (#2410). Owning a node of a kind the existence check does not track — an `entity`, `usecase`, `resource` or `user` — still draws both codes; that residual is #2442.
