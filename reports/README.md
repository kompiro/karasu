# reports/ — generated PoC evidence

This directory is where a PoC or spike writes the artifacts it produces: rendered
before/after diagrams, measurement summaries, screenshots, and the small script that
generated them. It exists so that evidence stops living at ad-hoc paths outside the
repository, where it has no anchor to the branch it describes and does not survive a
devcontainer rebuild (Issue #2419). The decision and the alternatives rejected on the way
are recorded in [ADR-2419](../docs/adr/2419-poc-report-directory.md).

## The rule

**`reports/*` is gitignored; only this README is tracked.** So the default is unchanged:
generated analysis never lands in a mainline PR. Two things follow.

- On `main` and on ordinary feature branches, generate freely — `git status` stays clean
  and nothing can be committed by accident.
- On a `spike/**` branch you **may** commit a report with `git add -f reports/<topic>`, so
  the report travels with (and dies with) the spike branch it documents. Spike branches are
  never merged, so this cannot reach `main`.

Durable conclusions do not belong here. A report is the evidence; the conclusion goes to
the design doc, the ADR, or the issue, which outlive the branch. Do not link to a file
under `reports/` from `docs/` — treat a report the way `docs/process.md` treats a spike
preview URL: fine to share while the work is live, never a documented destination.

## Layout

One directory per PoC, named after the topic:

```
reports/
  node-chrome-poc/
    build.ts       # the generator — keep it next to its output
    index.html     # the report, self-contained (no external CSS/JS/images)
    artifact.html  # the same report without the document skeleton, for publishing
  <topic>/
```

Name the entry point `index.html` so the directory can be served as-is.

## Reading a report

Open `index.html` from the filesystem, or publish `artifact.html` as a **private Claude
Artifact** and read it at the URL that comes back (Issue #2436). Publishing needs the
skeleton-free form because the host wraps the content in its own
`<!doctype html>…<body>`; that is the only difference between the two files.

Two things follow from the report being private evidence rather than a page.

- **Delete the Artifact when you fold up the spike.** Nothing expires it on its own, and a
  report is meant to die with the branch it documents.
- **An Artifact URL is not a documented destination either.** The rule above applies to it
  unchanged: fine to keep while the work is live, never linked from `docs/`.

Publishing does not require committing the report, so `git add -f` is now about making the
evidence travel with the branch, not about making it readable.

## Shared scaffolding

The recurring parts — the HTML page shell, the before/after pair layout, `.krs` → SVG
rendering, and browser screenshots — live in `scripts/report/` (tracked, typechecked, and
covered by `pnpm test:scripts`; a library under `reports/` would be gitignored). A
generator is usually this short:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { pair, reportFragment, reportPage } from "../../scripts/report/index.ts";
import { renderKrs } from "../../scripts/report/index.ts";

const source = /* ... .krs source ... */ "";
const before = renderKrs(source, { theme: "light" });
const after = renderKrs(source, { theme: "dark" });

const options = {
  title: "Node chrome PoC",
  meta: ["spike/node-chrome", "Issue #2366"],
  sections: [
    {
      title: "System view",
      body: pair(
        { label: "before", svg: before, background: "light" },
        { label: "after", svg: after },
        "Same model, light and dark theme.",
      ),
    },
  ],
};

mkdirSync("reports/node-chrome-poc", { recursive: true });
writeFileSync("reports/node-chrome-poc/index.html", reportPage(options));
writeFileSync("reports/node-chrome-poc/artifact.html", reportFragment(options));
```

`scripts/report/demo.ts` is a runnable version of exactly that — the fastest way to start a
new report is to copy it:

```
pnpm report:demo               # writes reports/demo/index.html + artifact.html
pnpm report:demo --screenshot  # also exercises the Playwright rasterizer
```

The screenshot path needs a browser: `pnpm --filter @karasu-tools/e2e install-browsers`.

### API

| Export | Purpose |
| --- | --- |
| `reportPage(options)` | The whole page: styles, header, sections. Returns self-contained HTML. |
| `reportFragment(options)` | The same report without `<!doctype>` / `<html>` / `<head>` / `<body>`, for a host that supplies them. Publish this one. |
| `pair(before, after, caption?)` | Two panes side by side — the before/after comparison. |
| `pane(options)` | A single full-width pane, for artwork that has no counterpart. |
| `dataUri(bytes, mime)` | Embeds a PNG (or any binary) so the report stays one file. |
| `escapeHtml(text)` | For any text interpolated into a section body. |
| `renderKrs(source, options?)` | `.krs` (+ optional `.krs.style`) → SVG, via `packages/core`'s `compile()`. Throws on error diagnostics. |
| `capture(specs, options?)` | Screenshots a URL or a chunk of HTML with Chromium; returns PNG buffers. |

A section `body` is raw HTML, so anything the built-ins do not cover is a template literal
away. Multi-file models are out of `renderKrs`'s scope — import `compileProject` from
`packages/core` directly.

## Capturing a real "before"

`renderKrs` renders the tree you are standing in, so a genuine before/after across a code
change needs two checkouts. Render the baseline from a worktree on `main`, write the SVG
somewhere outside the repo, then read it back in the spike's generator:

```
git worktree add .claude/worktrees/baseline main
```

Both SVGs are then just strings handed to `pair()`.
