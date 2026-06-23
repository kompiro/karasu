# Using the karasu App

> **English**（this file） · [日本語](app.ja.md)

karasu ships a graphical app that turns your `.krs` files into live, navigable
diagrams. There are two ways to reach it:

- **`karasu serve`** — a local, **preview-only** server that watches the `.krs`
  files in a directory and re-renders them in your browser every time you save.
  You keep editing in your own editor; the preview follows along.
- **The in-browser playground** at **<https://karasu.pages.dev/>** — the full
  experience with a built-in editor, file tree, and live preview, running
  entirely in your browser. Nothing is installed and nothing leaves your machine.

Both share the same **preview pane**, so the [Preview pane](#the-preview-pane)
section below applies to either way of working.

## `karasu serve` — preview your real files

Run `serve` from a directory that contains one or more `.krs` files:

```bash
# from a directory with .krs files
npx --yes karasu@latest serve

# or point it at a directory and pick a port
npx --yes karasu@latest serve ./architecture --port 4000
```

```
karasu serve
  Directory : /path/to/architecture
  Preview   : http://localhost:3000

Watching for .krs file changes...
```

Open the printed URL (default **http://localhost:3000**). The page resolves which
file to show from the URL path:

| URL | File shown |
| --- | --- |
| `/` | `index.krs` (or the only `.krs` file if there is just one) |
| `/payment` | `payment.krs` |
| `/org` | `org.krs` |

`serve` is **preview-only** — it does not embed an editor. The workflow is a tight
loop:

1. Edit a `.krs` file in your usual editor (or the [VS Code extension](../guide/02-onboarding.md)).
2. Save.
3. The server detects the change and pushes it to the browser, which re-renders
   the diagram automatically. No manual refresh.

If a file has syntax errors the last good diagram stays on screen with an
**"outdated"** banner until you fix them — see [Diagnostics](#diagnostics).

> The app's supported entry file is `index.krs`. Keep your top-level model there
> so `/` resolves to it.

## The in-browser playground

If you just want to try karasu, open **<https://karasu.pages.dev/>**. It is the
same app with the editor enabled:

- A **Monaco** editor with `.krs` syntax highlighting (light and dark themes).
- A **file tree** for creating, renaming, and deleting `.krs` and `.krs.style`
  files — all stored locally in your browser (OPFS), so your work persists
  between visits and never touches a server.
- The same live **preview pane** described below, updating as you type.

The playground opens `index.krs` by default. See
[The editor](#the-editor-playground) for the editing features.

## The preview pane

The preview pane is the heart of the app and is identical in `serve` and the
playground.

### Diagram views

A model is shown through four views, selectable from the view tab bar or with a
keyboard shortcut:

| View | Shortcut | Shows |
| --- | --- | --- |
| **System** | `Ctrl/Cmd+1` | Service and system architecture |
| **Deploy** | `Ctrl/Cmd+2` | Deployment topology (physical structure) |
| **Org** | `Ctrl/Cmd+3` | Teams and roles (organizational structure) |
| **CRUD** | `Ctrl/Cmd+4` | Usecase × resource read/write matrix |

The three dimensions behind System / Deploy / Org are explained in
[Core Concepts](../concepts.md).

### Navigating a diagram

- **Zoom** — scroll the mouse wheel over the diagram.
- **Pan** — click and drag.
- **Drill down** — click a node that has children to descend into it; a
  breadcrumb tracks your depth.
- **Node details** — click a leaf node (or its info button) to open a side panel
  with the node's id, description, tags, and related connections.
- **Cross-view navigation** — jump between related views, e.g. from a service in
  **System** to where it runs in **Deploy**, or to the team that owns it in
  **Org**.

### Diagnostics

Parse errors, warnings, and informational messages appear in a banner above the
diagram. While errors exist, the diagram keeps showing the last successfully
parsed version with an **"⚠ Diagram is outdated — fix errors to update"** notice,
so a typo never blanks your screen.

### Toolbar

The preview toolbar offers:

- **Icon mode** — toggle between service icons and plain shapes.
- **Show All Layers** — render every drill-down level stacked together.
- **Export** — save the current view as **SVG**; the split-button menu also
  exports the drill-down tree, a single SVG bundling **all** views, or
  **draw.io** (mxGraph XML) for further manual editing.
- **Reference** — open the built-in tag/annotation reference in a pop-out window
  you can keep beside the diagram.
- **Focus** (`Ctrl/Cmd+Shift+F`) — expand the preview to full width.

## The editor (playground)

When the editor is available (the playground, not `serve`), authoring `.krs` is
assisted by:

- **Syntax highlighting** for `.krs` and `.krs.style`, in light and dark themes
  that follow your system preference.
- **Format** (`Shift+Alt+F`, or the **⌥ Format** button) to tidy a `.krs` file.
  For `.krs.style` files a **✨ Tidy** button merges duplicate rules instead.
- A **live preview** that re-renders as you type — no save required.
- A collapsible **sidebar** (`Ctrl/Cmd+B`) that switches between a **Files** tree
  (`Ctrl/Cmd+Shift+E`) and an **Outline** of the current model (`Ctrl/Cmd+Shift+O`).
  Selecting an outline node highlights it in the diagram.

The edit pane also has **Chat** and **Settings** tabs. Chat is an optional AI
assistant for drafting and editing `.krs`; it requires you to store an API key in
Settings first.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Shift+P` | Open the command palette — search and run any command |
| `Ctrl/Cmd+1` … `Ctrl/Cmd+4` | Switch to System / Deploy / Org / CRUD view |
| `Ctrl/Cmd+Shift+F` | Toggle preview focus (full width) |
| `Ctrl/Cmd+B` | Toggle the sidebar (playground) |
| `Ctrl/Cmd+Shift+E` | Show the Files tree (playground) |
| `Ctrl/Cmd+Shift+O` | Show the Outline (playground) |
| `Shift+Alt+F` | Format the current `.krs` file (playground) |

## See also

- [Core Concepts](../concepts.md) — the logical / physical / organizational
  dimensions the views render.
- [Guides](../guide/README.md) — task-oriented walkthroughs of designing,
  reading, and evolving a model.
- [Syntax reference](../spec/syntax.md) and
  [Tags & annotations](../spec/tags-annotations.md) — the `.krs` language the app
  renders.
