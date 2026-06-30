# design-sync NOTES — karasu — Landing Demo

Project: `karasu — Landing Demo` (`d05b21a3-448e-4e0a-b9a1-5641fabaadc5`).
Purpose: high-fidelity import of karasu's real UI primitives + key app-shell
components + brand theme so Claude Design's agent can build an on-brand
**landing page**. Scope is deliberately narrow (12 components), not the full app.

## Repo shape (why the config looks the way it does)

- `@karasu-tools/app` is a **private Vite app**, NOT a published component
  library — no `main`/`module`/`exports`, no component `.d.ts` tree. So this is
  a **synth-entry** sync driven by a hand-written barrel.
- **Barrel entry**: `packages/app/.ds-entry.tsx` (gitignored) re-exports exactly
  the scoped components + `LocaleProvider`. Passed via `--entry`. Keeping a
  custom barrel (instead of letting synth-entry `export *` the whole `src/`)
  avoids bundling Monaco and the rest of the app.
- `@/*` aliases resolve via `cfg.tsconfig` → `packages/app/tsconfig.json`
  (`tsconfigPathsPlugin`). **Directory imports need an explicit `/index`** —
  `@/i18n` failed ("is a directory"); use `@/i18n/index`.
- Source uses NodeNext-style explicit `.js` import extensions; esbuild rewrites
  `.js`→`.ts` natively, so they resolve. (Most are `import type`, erased anyway.)

## Theme / CSS

- Tailwind v4 via `@tailwindcss/vite`; the raw `src/styles/index.css` is NOT
  real CSS (`@import "tailwindcss"`). The shipped theme is the **compiled**
  output. `cfg.buildCmd` runs `vite build` then copies the hashed
  `dist/assets/index-*.css` to a stable `dist/ds-theme.css`, and
  `cfg.cssEntry` points there. Re-sync: always re-run buildCmd (the hash changes).
- Fonts **Figtree** (UI) + **JetBrains Mono** (code) load via a remote Google
  Fonts `@import` baked into the compiled CSS → `[FONT_REMOTE]` (runtime, fine).

## Provider

- `cfg.provider = { component: "LocaleProvider" }` (exported from `@/i18n/index`).
  `useTranslation` THROWS without `<LocaleProvider>` — required by ErrorBanner,
  NodeDetailPanel, and any future i18n component.

## Known render warns (triaged legitimate, non-blocking)

- `[TOKENS_MISSING]` ~218 vars, almost all `--vscode-*` (Monaco/VS Code editor
  theme vars) — injected at runtime in the real app, never by these components.
  Not karasu brand tokens (those ARE defined). Expected absent.
- `[FONT_DANGLING] "codicon"` — VS Code icon font referenced by the compiled
  CSS but not used by any scoped component. Dead reference; safe to ignore.

## Toolchain

- Playwright **1.59.1** pins cached `chromium-1217` (`~/.cache/ms-playwright`).
  Installed into `.ds-sync` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## Re-sync risks

- The barrel `packages/app/.ds-entry.tsx` is **gitignored** (machine state). A
  fresh clone must recreate it before re-sync (or commit it deliberately). If a
  scoped component is renamed/moved in the app, both the barrel and
  `componentSrcMap` must be updated.
- `cfg.cssEntry` depends on the buildCmd copy step running; the hashed source
  file name changes every build.
- `--vscode-*` token noise will grow if any Monaco-coupled component is added to
  scope — re-triage if the list changes character (non-vscode tokens appear).
