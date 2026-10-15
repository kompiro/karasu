# karasu-skills

## 0.2.0

### Minor Changes

- bfa92d2: Add the `karasu-author` skill: build and update a `.krs` model of your own system through conversation, one layer at a time, checking every change with `karasu check` and `karasu fmt`. Both skills now read `karasu capabilities --json` in Step 0 and switch to the replacement of any renamed command (#2912).
- 02de903: **`.krs language v1.0` → `.krs language v2.0`.** This release implements language v2.0, the first breaking language major after the v1.0 freeze. `karasu --version` reports it on its second line. (#2677, #2924)

  - **The tag and annotation vocabularies are closed to the tool's own.** A non-builtin tag or annotation still parses but has no effect, and is warned (`tag-not-builtin` / `annotation-not-builtin`). A `.krs.style` rule whose selector names one **matches nothing** (`style-tag-selector-not-builtin` / `style-annotation-selector-not-builtin` say so). Migrate such a rule to a facet: declare `facet <id> { … }`, write `facets <id>` on the elements, and select `[facets=<id>]`. Specificity is unchanged.
  - **`facet` and `boundary` are core notation**, no longer experimental. `facet` is the only user extension point of the vocabulary; `boundary` (the declaration, `contains`, the scoped declaration and the `boundary` / `boundary#<id>` style selectors) now carries a backward-compatibility promise too. (#2678)
  - **Two forms v1.x only warned about are rejected as errors.** A logical node nested where its parent cannot contain it (for example a `usecase` directly in a `service`) is a `node-not-in-context` error and is left out of the model; `unassigned-usecase` is retired, because its only case is now that error. A misspelling of a builtin annotation (`@depracated`) is an `annotation-possible-typo` error. To migrate, clear these two diagnostics while still on v1.x, before upgrading.
  - **An error means syntax karasu does not accept, and nothing new is drawn while one stands.** The VS Code preview now keeps the last valid diagram for the same view, as the app already did; `karasu render` / `karasu subtree` write nothing and exit 1.
  - `karasu translate --from openapi` and `--from db --emit-bindings` put their usecases in a provisional domain so their output stays valid.

### Patch Changes

- 5a4c683: `karasu diff` now reports the after model's resolver warnings, once per diff on both the default bundled output and `--view`, in the same `Warning:` / `Info:` format as `karasu render`, with each warning naming the file it came from. The diff also stops printing every diagnostic twice and no longer reports a false circular style import when both sides import the same style sheet (#2879).
- 7e06b0e: A `.krs.style` tag selector whose name starts with a digit, such as `[3d-secure]` or `[2026-q3]`, now reads as one name, the same name the `.krs` tag lands on. It used to stop at `3d` and report three token-type errors. Because such a tag is outside the tool vocabulary, the rule now gets `style-tag-selector-not-builtin`, which names the tag you wrote. (#2849)
- dc23315: A non-ASCII character that is neither whitespace nor part of a name (an emoji, `→`, a zero-width space, a combining mark that does not continue a word) is no longer silently dropped. `service 😀A` used to declare `A` and `A → B` read as `A B`, with no diagnostic; such a character now reaches the parser, which reports it like a name starting with a digit (#3093). Quote the name to use the character: `service "😀A"`.

  Every character with the Unicode `White_Space` property (the ideographic space U+3000, no-break space, U+2028, ...) and the byte order mark are now read as whitespace, so files that relied on them being dropped keep parsing. ZWNJ and ZWJ now stay inside a word between letters of Arabic-family and Indic scripts, so Persian and Indic names that contain them are one name instead of splitting apart; anywhere else (after a Latin letter, at the end of a name) a joiner is invisible and is refused rather than creating a lookalike id. The syntax reference gains a Lexical structure section that lists how each character is read.

- de061ae: When two systems declare a node with the same id (`Shop.Api` and `Admin.Api`), each card is now drawn with its own style, `column` hint, facet ring and compare-mode state instead of one taken from its namesake, and the draw.io root page gives each card its own cell with its own system's edges (#2934). Lookups by bare id (`nodeMetadata`, `nodeFileIndex`, the style entry a ghost card reads) all answer with the same node, the `nodePathIndex` winner, and new path-keyed maps (`nodeFileIndexByPath`, `facetIndexByPath`, `nodePathRanking`, `ResolvedStyles.nodesByPath`, `nodeDiffByPath`) hold every node's own value. A service a named import mounts under a system (completing a stub there, or referenced by the system's edges) is filed under the imported file at that path, so jump-to-editor on a completed stub now opens the file that defines it. Models without a shared id render as before, except that the draw.io root page of a multi-system model now names its cells by path (`system-Shop_Api`).
- 721251d: Static SVG exports (`karasu render`, the drill-down and all-views bundles) now emit one `#krs-system-<id>` / `#krs-entity-<id>` level per id. When two nodes share an id, the level shows the node the app opens for the same anchor (the `@migration_target`-first winner), and a later system's nodes are drawn from their own content instead of copying the first system's. The stacked all-layers export labels each band with its own system. (#2933)

## 0.1.0

### Minor Changes

- 72f0cb4: First release of `karasu-skills`, a Claude Code plugin that ships karasu's agent skills. It starts with `reverse-architecture`, which reverse-engineers a repository into a `.krs` model. Install it with `/plugin marketplace add kompiro/karasu` and `/plugin install karasu@karasu`. Each skill first checks that the installed karasu CLI is at least the version it was written for (#2932).
