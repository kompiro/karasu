# Using the karasu CLI

> **English**（this file） · [日本語](cli.ja.md)

The `karasu` CLI is the command-line side of karasu. It covers two main jobs:

- **Authoring locally** — preview your `.krs` files in the browser while you
  edit, and keep them formatted and lint-clean.
- **Rendering in automation** — turn `.krs` into SVG (or draw.io) from a script
  or CI job, so committed diagrams stay in sync with the model.

You do not need to install anything. The published package is **`karasu`**, so
every command can be run on demand with `npx`:

```bash
npx --yes karasu@latest <command> [args]
```

Pin a version (`karasu@0.1.0`) in CI to avoid surprises. The rest of this page
drops the `npx --yes` prefix for brevity — `karasu render …` means
`npx --yes karasu@latest render …`.

## When to reach for the CLI

| You want to… | Use |
| --- | --- |
| See your real `.krs` files update live as you edit | [`karasu serve`](#karasu-serve--live-preview) |
| Produce an SVG for docs, a README, or CI | [`karasu render`](#karasu-render--krs--svg) |
| Keep `.krs` / `.krs.style` formatted and valid | [`fmt` / `tidy-style` / `lint-style`](#command-reference) |
| Lift an existing system into `.krs` | [`translate`](#command-reference) |
| Review what changed between two revisions | [`diff`](#command-reference) |

If you prefer a graphical, click-through experience instead of a preview that
follows your editor, see [Using the App](app.md).

## `karasu serve` — live preview

`serve` watches the `.krs` files in a directory and re-renders them in your
browser every time you save. You keep editing in your own editor; the preview
follows along. Reach for it during **local authoring**.

```bash
# from a directory with .krs files
karasu serve

# or point it at a directory and pick a port
karasu serve ./architecture --port 4000
```

```
karasu serve
  Directory : /path/to/architecture
  Preview   : http://localhost:3000

Watching for .krs file changes...
```

| Argument / option | Default | Meaning |
| --- | --- | --- |
| `[dir]` | `.` | Directory to watch for `.krs` files |
| `-p, --port <number>` | `3000` | Port the preview server listens on |

Open the printed URL and edit — save, and the diagram re-renders with no manual
refresh. `serve` is **preview-only**; it embeds no editor. The
[Using the App](app.md) page covers the preview pane (views, navigation,
diagnostics, exports) and the URL-to-file mapping in detail.

## `karasu render` — `.krs` → SVG

`render` converts a `.krs` file to an SVG (or draw.io XML) **without a browser**.
This is the command for **automation**: rendering a diagram in CI, embedding it
in docs, or committing an up-to-date SVG back to a repo. By default it writes to
stdout, so you redirect or pipe the result.

```bash
# Pipe to stdout and redirect to a file
karasu render index.krs > docs/arch.svg

# Write directly to a file
karasu render index.krs --output docs/arch.svg

# Render a single view
karasu render index.krs --view deploy --output deploy.svg

# Use the light color theme (default: dark)
karasu render index.krs --theme light --output arch-light.svg

# Optimize via a pipe — no temp file
karasu render index.krs | svgo - -o docs/arch.svg

# Export to draw.io (mxGraph XML) as a layout escape hatch
karasu render index.krs --format drawio --output arch.drawio
```

| Option | Default | Meaning |
| --- | --- | --- |
| `-o, --output <path>` | stdout | Write output to a file instead of stdout |
| `--view <type>` | all views bundled | One of `system` \| `deploy` \| `org` |
| `--format <format>` | `svg` | `svg`, or `drawio` (one page per view + drill-down level) |
| `--theme <theme>` | `dark` | `dark` \| `light` — diagram color theme (svg only) |
| `--include-matrix` | off | Also write `<output-stem>.matrix.svg` (requires `--format svg` and `--output`) |

`render` resolves `@import` statements relative to the entry file, so for a
multi-file model you only point it at the top-level file. It exits with status
`1` on a missing file or a parse error (warnings alone keep status `0`), which
makes it safe to gate a CI step on. For a ready-made GitHub Actions workflow,
see [GitHub Actions integration](../github-actions.md).

## Command reference

`serve` and `render` cover most day-to-day use. The CLI also includes commands
for keeping files tidy, lifting an existing system into `.krs`, and reviewing
changes. Run `karasu <command> --help` for the full option list and examples.

| Command | What it does |
| --- | --- |
| `serve [dir]` | Serve `.krs` files from a directory with live preview |
| `render <file>` | Render a `.krs` file to SVG or draw.io |
| `matrix <file>` | Render a usecase × resource CRUD matrix (`md` / `csv` / `svg`) |
| `fmt [files...]` | Format `.krs` files in place (`--check` for CI, `--stdin` for pipes) |
| `tidy-style [files...]` | Tidy `.krs.style` files: merge duplicate rules, group properties |
| `lint-style [files...]` | Lint `.krs.style` property values against the schema |
| `translate <file>` | Translate an infra config or API spec into a `.krs` scaffold (`--from compose` \| `k8s` \| `openapi` \| `db`) |
| `apply <file>` | Apply piped `.krs` from stdin — replace a node by id, else append |
| `append <file>` | Append piped `.krs` from stdin as a new top-level block |
| `insert <parent-id> <file>` | Insert piped `.krs` from stdin as the last child of a node |
| `remove <node-id> <file>` | Remove a node by id from a `.krs` file in place |
| `diff <before> <after>` | Render a diff SVG between two `.krs` revisions (either side may be `-` for stdin) |

`translate` together with `apply` on a Unix pipe is how you fold changes from
the infrastructure side back into an existing model:

```bash
# Translate a compose file and merge it into an existing deploy.krs
karasu translate --from compose docker-compose.yml | karasu apply deploy.krs
```

## See also

- [Using the App](app.md) — the graphical preview/playground that shares
  `karasu serve`'s preview pane.
- [GitHub Actions integration](../github-actions.md) — rendering diagrams in CI
  with `karasu render`.
- [Core Concepts](../concepts.md) — the logical / physical / organizational
  dimensions the views render.
- [Syntax reference](../spec/syntax.md) and
  [Tags & annotations](../spec/tags-annotations.md) — the `.krs` language the CLI
  parses.
