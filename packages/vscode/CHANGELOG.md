# karasu-vscode

## 0.3.0

### Minor Changes

- afb3f03: Raise the minimum VS Code version to 1.137. `engines.vscode` keeps tracking
  `@types/vscode`, so the extension is typechecked against exactly the API level it
  advertises. VS Code ships weekly and auto-updates, so hosts at or above 1.137 are
  the norm; installs on 1.125 through 1.136 stay on the previously published version.

### Patch Changes

- 612aa45: Preview drill-down and the detail panel resolve the clicked card by its
  `data-node-path` (#2917): with two same-named services in different systems,
  clicking the card inside `Admin` now drills into `Admin` and shows `Admin`'s
  metadata, instead of the bare-id winner. Cards without a path behave as before.
- Updated dependencies:
  - @karasu-tools/core@0.3.1
  - @karasu-tools/i18n@0.0.1
  - @karasu-tools/lsp@0.1.0

## 0.2.0

### Minor Changes

- 840d44e: Register the built-in icon set inside core, so `shape: url("<name>")` and icon display mode draw the icons on every surface — `karasu render` / `karasu diff` / `karasu serve`, the VS Code preview, and any embedder of `@karasu-tools/core` — not only in the browser app.

  A `url()` that names no registered icon is now reported as a new `style-unknown-icon` warning at the declaration (app warning panel, VS Code Problems via the LSP, `karasu lint-style`, `karasu render`) instead of silently drawing a `box`. `karasu render` now prints the position of any warning that carries one, the way it already prints a diagnostic's.

  Core gains `registerBuiltinIcons()` and `resetRegistryToBuiltins()` for embedders and tests that clear the shape registry (#2802).

- 4613295: Export a `NODE_DETAIL_KIND_ICON_NAMES` kind→icon-name map from `@karasu-tools/core`, the single source of truth for the node detail panel's header pictogram (each surface maps the icon name to its own form — an SVG pictogram in the app, an emoji glyph in the VS Code webview). This resolves the panel's kind→icon divergence in the VS Code preview (#2068): a `usecase` node no longer shares `domain`'s icon, and `store` nodes now get a distinct icon instead of the generic `■` fallback. The two renderers can no longer silently drift because they consume the same exported map.
- 4613295: The VS Code preview's node detail panel now also renders the Storage resources and Capabilities sections (for `client` nodes) and the Migration intent section (`@deprecated`/`@experimental`/`@migration_target`), matching the app's `NodeDetailPanel` layout and section order — previously the webview panel omitted all three entirely (#2068). The app-only `annotationDiff` section (used by the diff viewer) is intentionally not added: the VS Code extension has no diff-view surface to feed it.
- 36cf3a6: Raise the minimum VS Code version to 1.125. `engines.vscode` now tracks
  `@types/vscode`, so the extension is typechecked against exactly the API level it
  advertises. VS Code ships weekly and auto-updates, so hosts at or above 1.125 are
  the norm; installs on 1.111 through 1.124 stay on the previously published version.
- 73e93a0: The preview WebView's node detail panel now localizes its labels to VS Code's
  display language, matching the app's detail panel. Section titles (Links,
  Storage resources, Capabilities, Migration intent), the close button, and the
  "Jump to editor" / "View in Deploy diagram" buttons are resolved from the
  shared i18n catalog per `vscode.env.language` instead of being hardcoded
  English. This also fixes two pre-existing parity glitches under English: the
  Deploy-nav button previously showed Japanese text and "Jump to editor" was
  missing its ↗ icon. (#2074)

### Patch Changes

- 8722698: Update the in-browser playground link in the README to the new custom domain `https://karasu.kompiro.dev/` (migrated from `karasu.pages.dev`, #1809).
- 62571e1: A `client` owned by a team now shows the `👥` owner chip on its system-view card and the team row in the detail panel, and a `client` a deploy unit `realizes` now gets the deploy-view jump button — both were silently dropped even though `owns` / `realizes` resolved (Issue #2157, following ADR-1720). The chip and the detail panel now show the team's declared `label` (falling back to its id), matching how `Group by: team` frames title themselves; navigation still resolves by team id.
- 2c83d44: Draw an unpainted container frame in the theme's chrome instead of the cascade's card default (#2662). A group frame and a ghost ancestor container took their title and outline from `DEFAULT_NODE_STYLE`, which is hard-coded to the dark palette, so on the light theme the title was near-white (`#F9FAFB`) on a white canvas. Both now fall back to the chrome palette's `textPrimary` / `mutedBorder`, the roles `org-tree-renderer.ts` already names for the same two jobs. A colour any rule names is unaffected: the fallback is chosen from which properties the cascade applied, so naming the base hex on purpose is honoured rather than read as silence.
- f86dbce: Code completion now offers the missing broadly-usable declaration keywords (`entity`, `capability`, `boundary`, `database`, `queue`, `storage`, `import`, `legend`) and keeps the deploy-block keyword `store`. Block-scoped keywords (`from`, `contains`, `swatch`, …) remain excluded from the flat suggestion list pending context-aware completion.
- 35e3515: Move the language client and server to the 10.x line together, so both sides of the extension speak LSP protocol 3.18.2. They were on 9.x, and the two packages pin the protocol exactly — taking either side alone leaves the client and server disagreeing about the protocol version, which makes editor ↔ preview cursor sync land on the wrong line rather than not move at all (#2337). Nothing user-facing changes on its own, but the pair now moves as a unit, and Dependabot groups the three packages so a future update cannot split them again.
- 2b4b7bb: Resolve the display language by the whole primary subtag instead of a `ja` prefix, so a user whose environment reports Javanese (`jav`, `jav-ID`) or Jamaican Creole (`jam`, `jam-JM`) gets the English fallback rather than a Japanese UI. Japanese keeps resolving from every form the surfaces report, including the POSIX modifier (`ja@cjknarrow`) and Windows' `Japanese_Japan.932`.
- 166a983: The detail panel's "Open deploy view" now highlights the container that
  realizes the service. The preview's highlight message names the attribute it
  matches on (`data-realized-node-id` for a jump into the deploy view,
  `data-node-id` otherwise), so the container is found from the node's id
  regardless of how the container's own id is spelled (#2818).
- Updated dependencies:
  - @karasu-tools/core@0.3.0
  - @karasu-tools/i18n@0.0.1
  - @karasu-tools/lsp@0.1.0

## 0.1.3

### Patch Changes

- 7b8ca40: Fix broken screenshot links in the VS Code Marketplace README. The README used relative image paths (`images/screenshots/…`), which `vsce` rewrote to repository-root URLs (`…/raw/HEAD/images/…`), ignoring the `packages/vscode` monorepo directory — so they 404'd on the Marketplace. Use absolute `raw.githubusercontent.com` URLs that resolve to `packages/vscode/images/…`.

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @karasu-tools/core@0.2.0
