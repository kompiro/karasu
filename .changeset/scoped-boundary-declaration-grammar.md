---
"@karasu-tools/core": minor
"karasu": minor
---

`boundary` blocks can now be declared inside a node block (`system` / `service` / `domain` / `usecase` / `database` / `queue` / `storage`), not only at the top level. A scoped block's `contains` resolves against that node's **direct children**, so it can only ever name one node — the ambiguity a top-level `contains` has when the same id exists at several levels (#2036) cannot be written in this form.

Two diagnostics come with it: `boundary-not-in-context` (error) when a block sits in a kind that draws no canvas of its own, and `duplicate-boundary-id` (error) when one scope declares the same boundary id twice. Existing top-level `boundary` blocks are untouched, including their behaviour on duplicate ids.

`karasu fmt` preserves scoped `boundary` blocks, and `duplicate-node-id-parent` now also covers the children of a top-level `database` / `queue` / `storage` block — previously that check was only seeded from `system`, top-level `service` and top-level `domain`, so a system-less infra block with two same-id children parsed clean. Models relying on that gap will start reporting the duplicate.

This first slice covers the grammar, the scope-keyed membership index and the diagnostics; frames for scoped boundaries are wired into the renderer in a follow-up.
