# karasu — GitHub Actions workflow templates

Copy one of these templates to `.github/workflows/karasu.yml` in your repository
to automatically generate SVG diagrams whenever `.krs` files change.

## Prerequisites

- Your repository must have `karasu render` available via `npx karasu@latest`
- Workflow permissions must allow writing (see [Permissions](#permissions) below)

## Templates

### `single-file.yml` — One .krs file, one SVG

The simplest setup. Renders a single entry file on every push to `main`.

```yaml
- name: Render diagram
  run: npx --yes karasu@latest render docs/architecture.krs --output docs/architecture.svg
```

**When to use:** Your project has one top-level `.krs` file (possibly using `@import`).

### `multi-file.yml` — Multiple diagrams via matrix

Uses a matrix strategy to render several `.krs` entry files independently.

```yaml
strategy:
  matrix:
    diagram:
      - input: docs/system/index.krs
        output: docs/system/architecture.svg
      - input: docs/deploy/index.krs
        output: docs/deploy/architecture.svg
```

**When to use:** You maintain separate diagrams for system, deploy, and org views,
each with their own entry file.

## Permissions

The workflow commits the generated SVG back to your repository, which requires
write access to `contents`.

1. Go to **Settings > Actions > General > Workflow permissions**
2. Select **"Read and write permissions"**
3. Click **Save**

The `[skip ci]` tag in the commit message prevents an infinite workflow loop.

## Viewing diagrams without karasu

Once SVGs are committed to your repository, they render natively in GitHub's
Markdown preview and file browser — no tools required for readers.

## Next steps

A dedicated `karasu-action` GitHub Action for Marketplace distribution is planned.
Follow [kompiro/karasu](https://github.com/kompiro/karasu) for updates.
