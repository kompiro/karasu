# GitHub Actions integration

karasu can automatically generate SVG diagrams in CI/CD pipelines using the
`karasu render` CLI command. This page explains how to integrate karasu into
GitHub Actions.

## Overview

When a `.krs` file changes, the workflow:

1. Runs `karasu render` to produce an SVG
2. Commits the SVG back to the repository

The committed SVG renders natively in GitHub's file browser and Markdown previews,
so team members can see up-to-date architecture diagrams without installing karasu.

## Quick start

Copy [`examples/github-actions/single-file.yml`](../examples/github-actions/single-file.yml)
to `.github/workflows/karasu.yml` in your repository, then adjust the input and
output paths:

```yaml
- name: Render diagram
  run: npx --yes karasu@latest render docs/architecture.krs --output docs/architecture.svg
```

Enable write permissions:
**Settings > Actions > General > Workflow permissions → "Read and write permissions"**

## Templates

| Template | Use case |
|---|---|
| [`single-file.yml`](../examples/github-actions/single-file.yml) | One entry `.krs` file → one SVG |
| [`multi-file.yml`](../examples/github-actions/multi-file.yml) | Multiple entry files rendered via matrix strategy |

## Rendering specific views

By default `karasu render` outputs all views bundled into a single SVG with CSS
tab navigation. To render a single view:

```yaml
- run: npx --yes karasu@latest render index.krs --view system --output system.svg
- run: npx --yes karasu@latest render index.krs --view deploy --output deploy.svg
- run: npx --yes karasu@latest render index.krs --view org --output org.svg
```

## Using with `@import`

`karasu render` resolves `@import` statements relative to the entry file.
You only need to specify the top-level entry file:

```
docs/
├── index.krs          ← entry file (imports the others)
├── services.krs
└── deploy.krs
```

```yaml
- run: npx --yes karasu@latest render docs/index.krs --output docs/architecture.svg
```

## Pinning the karasu version

Replace `karasu@latest` with a specific version to avoid unexpected breakage:

```yaml
- run: npx --yes karasu@0.1.0 render index.krs --output docs/architecture.svg
```

## Exit codes and error handling

| Situation | stderr | Exit code |
|---|---|---|
| File not found | `Error: File not found: <path>` | 1 |
| Parse errors | `Error: <file>:<line>:<col>: <message>` | 1 |
| Warnings only | `Warning: <message>` | 0 |
| Success | — | 0 |

The workflow step fails automatically when `karasu render` exits with code 1,
so broken `.krs` files will block the SVG commit step.

## Preventing infinite loops

The commit step includes `[skip ci]` in the commit message, which prevents GitHub
Actions from re-triggering the workflow on the bot's own commit:

```yaml
git commit -m "chore: update architecture diagram [skip ci]"
```

## Future: GitHub Marketplace Action

A dedicated `karasu-action` for GitHub Marketplace is planned, which will
simplify setup further:

```yaml
# planned — not yet available
- uses: kompiro/karasu-action@v1
  with:
    input: docs/architecture.krs
    output: docs/architecture.svg
```

Follow [kompiro/karasu](https://github.com/kompiro/karasu) for updates.
