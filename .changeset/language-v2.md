---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
"karasu-skills": minor
---

**`.krs language v1.0` → `.krs language v2.0`.** This release implements language v2.0, the first breaking language major after the v1.0 freeze. `karasu --version` reports it on its second line. (#2677, #2924)

- **The tag and annotation vocabularies are closed to the tool's own.** A non-builtin tag or annotation still parses but has no effect, and is warned (`tag-not-builtin` / `annotation-not-builtin`). A `.krs.style` rule whose selector names one **matches nothing** (`style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin` say so). Migrate such a rule to a facet: declare `facet <id> { … }`, write `facets <id>` on the elements, and select `[facets=<id>]`. Specificity is unchanged.
- **`facet` is core notation**, no longer experimental: it is the only user extension point of the vocabulary.
- **Two forms v1.x only warned about are rejected as errors.** A logical node nested where its parent cannot contain it (for example a `usecase` directly in a `service`) is a `node-not-in-context` error and is left out of the model; `unassigned-usecase` is retired, because its only case is now that error. A misspelling of a builtin annotation (`@depracated`) is an `annotation-possible-typo` error. To migrate, clear these two diagnostics while still on v1.x, before upgrading.
- **An error means syntax karasu does not accept, and nothing new is drawn while one stands.** The VS Code preview now keeps the last valid diagram for the same view, like the app and the CLI already did.
- `karasu translate --from openapi` and `--from db --emit-bindings` put their usecases in a provisional domain so their output stays valid.
