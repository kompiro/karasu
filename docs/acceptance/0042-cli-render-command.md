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
- [x] Parse diagnostics → stderr + exit code 1
- [x] `--view system` → calls `compileProject` with `diagramType: "system"`
- [x] `--view deploy` → calls `compileProject` with `diagramType: "deploy"`
- [x] `--view org` → calls `compileProject` with `diagramType: "org"`
- [x] Warnings → printed to stderr, exit code 0
- [x] CLI wiring: `render <file>`, `--output`, `-o`, `--view` all parsed correctly

## Manual verification checklist

### Setup

```bash
cd .worktrees/cli-render
npm run build --workspace=packages/core
npm run build --workspace=packages/cli
```

Prepare a test `.krs` file:

```bash
cat > /tmp/test.krs << 'EOF'
system ECommerce "E-Commerce System" {
  service Frontend "Frontend"
  service Backend "Backend"
  Frontend -> Backend
}
EOF
```

### 1. Default all-views output to stdout

```bash
node packages/cli/dist/index.js render /tmp/test.krs
```

- [ ] Output is a valid SVG (starts with `<svg`)
- [ ] SVG contains tab bar elements (`krs-tab`, `krs-pane`)

### 2. Write to file with --output

```bash
node packages/cli/dist/index.js render /tmp/test.krs --output /tmp/arch.svg
cat /tmp/arch.svg
```

- [ ] File `/tmp/arch.svg` is created
- [ ] File contents is a valid SVG

### 3. --view system

```bash
node packages/cli/dist/index.js render /tmp/test.krs --view system
```

- [ ] Output is SVG containing system diagram nodes
- [ ] No tab bar (single-view output)

### 4. --view deploy

```bash
node packages/cli/dist/index.js render /tmp/test.krs --view deploy
```

- [ ] Output is a valid SVG (deploy diagram, may be empty if no deploy blocks defined)

### 5. --view org

```bash
node packages/cli/dist/index.js render /tmp/test.krs --view org
```

- [ ] Output is a valid SVG (org diagram, may be empty if no org blocks defined)

### 6. File not found → exit code 1

```bash
node packages/cli/dist/index.js render /tmp/nonexistent.krs
echo "exit code: $?"
```

- [ ] Exit code is `1`
- [ ] stderr contains "File not found"

### 7. Parse error → exit code 1

```bash
echo "invalid {{ syntax" > /tmp/broken.krs
node packages/cli/dist/index.js render /tmp/broken.krs
echo "exit code: $?"
```

- [ ] Exit code is `1`
- [ ] stderr contains error location and message

### 8. Pipe to svgo (stdout use case)

```bash
# requires: npm install -g svgo
node packages/cli/dist/index.js render /tmp/test.krs | svgo - -o /tmp/arch-optimized.svg
```

- [ ] `/tmp/arch-optimized.svg` is created and is a smaller valid SVG

### 9. Import resolution

Prepare a multi-file project:

```bash
mkdir -p /tmp/arch-project
cat > /tmp/arch-project/index.krs << 'EOF'
import "services.krs"
system ECommerce "E-Commerce" {
  service Frontend "Frontend"
  Frontend -> backend.Backend
}
EOF
cat > /tmp/arch-project/services.krs << 'EOF'
system backend "Backend Services" {
  service Backend "Backend API"
}
EOF
node packages/cli/dist/index.js render /tmp/arch-project/index.krs
```

- [ ] Output SVG contains nodes from both `index.krs` and `services.krs`
- [ ] No "file not found" or import error

### 10. Help output shows Examples section

```bash
node packages/cli/dist/index.js render --help
```

- [ ] Help includes "Examples:" section
- [ ] Examples show stdout pipe usage (e.g., `| svgo`)
- [ ] Examples show `--output` usage
- [ ] Examples show `--view` usage
