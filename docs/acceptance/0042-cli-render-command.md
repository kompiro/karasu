# AT-0042: CLI render command

- **Date**: 2026-04-04
- **Issue**: #121
- **Status**: Draft

## Overview

`karasu render <file>` renders a `.krs` file to SVG without launching the browser UI.
Supports all-views bundled output (default) and individual view output (`--view`).

## Automated checks (covered by unit tests)

- [x] `NodeFileSystemProvider` reads files, lists directories, and checks existence
- [x] Missing file → stderr error message + exit code 1
- [x] Default (no `--view`) → calls `buildAllViewsSvgProject`, SVG written to stdout
- [x] `--output <path>` → SVG written to file instead of stdout
- [x] Error-severity diagnostics → stderr + exit code 1
- [x] Warning-severity diagnostics → stderr + exit code 0
- [x] `--view system` → calls `compileProject` with `diagramType: "system"`
- [x] `--view deploy` → calls `compileProject` with `diagramType: "deploy"`
- [x] `--view org` → calls `compileProject` with `diagramType: "org"`
- [x] Analyzer warnings → printed to stderr, exit code 0
- [x] CLI wiring: `render <file>`, `--output`, `-o`, `--view` all parsed correctly

## Manual verification checklist

### Setup

```bash
cd .worktrees/cli-render
npm run build --workspace=packages/core
npm run build --workspace=packages/cli
alias karasu="node $(pwd)/packages/cli/dist/index.js"
```

### 1. Default all-views output to stdout

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `default (no --view) writes a bundled all-views SVG to stdout`

```bash
karasu render examples/ec-platform/01-system.krs
```

- [ ] Output is a valid SVG (starts with `<svg`)
- [ ] SVG contains tab bar elements (`krs-tab`, `krs-pane`)

### 2. Write to file with --output

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `--output writes the SVG to disk and leaves stdout empty`

```bash
karasu render examples/ec-platform/01-system.krs --output /tmp/ec-platform.svg
```

- [ ] File `/tmp/ec-platform.svg` is created
- [ ] File contents is a valid SVG

### 3. --view system

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `--view system produces a single-view system SVG without tab markers`

```bash
karasu render examples/ec-platform/01-system.krs --view system
```

- [ ] Output is SVG containing system diagram nodes (Frontend, Backend など)
- [ ] No tab bar (single-view output)

### 4. --view deploy

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `--view deploy produces a single-view deploy SVG`

```bash
karasu render examples/ec-platform/06-deploy/deploy.krs --view deploy
```

- [ ] Output is a valid SVG showing deploy containers and units

### 5. --view org

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `--view org produces a single-view org SVG`

```bash
karasu render examples/org/system.krs --view org
```

- [ ] Output is a valid SVG showing org structure

### 6. Import resolution (multi-file project)

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `multi-file project resolves imports without error`

```bash
karasu render examples/ec-platform/05-multifile/system.krs
```

- [ ] Output SVG contains nodes from all imported files
- [ ] No "file not found" or import error on stderr

### 7. Deploy diagram with all-views (default)

```bash
karasu render examples/ec-platform/06-deploy/deploy.krs
```

- [ ] SVG contains both system and deploy tabs
- [ ] Deploy tab shows container and unit nodes

### 8. File not found → exit code 1

> ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `nonexistent file writes a File not found error and exits with code 1`

```bash
karasu render examples/nonexistent.krs
echo "exit code: $?"
```

- [ ] Exit code is `1`
- [ ] stderr contains "File not found"

### 9. Pipe to svgo (stdout use case)

```bash
# requires: npm install -g svgo
karasu render examples/ec-platform/01-system.krs | svgo - -o /tmp/ec-optimized.svg
```

- [ ] `/tmp/ec-optimized.svg` is created and is a smaller valid SVG

### 10. Help output shows Examples section

```bash
karasu render --help
```

- [ ] Help includes "Examples:" section
- [ ] Examples show stdout pipe usage (e.g., `| svgo`)
- [ ] Examples show `--output` usage
- [ ] Examples show `--view` usage
