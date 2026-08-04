# karasu examples

This directory contains sample `.krs` files demonstrating the karasu architecture modeling language.

## Getting Started — EC Platform (step by step)

`ec-platform/` teaches the language progressively. Each file is **self-contained** and can be opened independently.

| File | Concepts |
|------|----------|
| `01-system.krs` | `system`, `service`, sync `->` and async `-->` edges |
| `02-users.krs` | `user [human]`, `user [ai]`, `role` |
| `03-domains.krs` | `domain`, `usecase`, `resource` — full drill-down hierarchy |
| `04-annotations.krs` | `[external]`, `@deprecated`, `@new`, `@experimental` |
| `05-multifile/` | `import { } from` — file splitting (VSCode Extension / server mode) |
| `06-deploy/` | `deploy`, `oci`, `jar`, `job`, `realizes` — physical structure |
| `multi-file-system/` | `import "file.krs"` whole-file form — split one `system` block across files, plus `deploy` / `organization` propagation |

## Themed Scenarios

All themed scenarios are **single-file** — paste into the karasu web app or VSCode Extension to try immediately.

### `hr-tool/system.krs`

A simple HR attendance tool. Demonstrates a shallow domain structure and side-by-side `[human]` / `[ai]` users.

### `payment-platform/system.krs`

A payment processing platform with multiple `[external]` services and a deploy diagram covering all major artifact types (`jar`, `oci`, `lambda`, `job`, `assets`). Includes a `.krs.style` file for team-based color theming, loaded via `@import` in `system.krs`.

### `migration/system.krs`

A system mid-migration from a legacy monolith to microservices. Demonstrates `@deprecated`, `@migration_target`, and `@experimental` annotations, and intentionally triggers a **domain drift warning** (same domain id in two services within the same system).

### `deploy/system.krs`

A retail platform focused on the **deploy diagram**. Shows all artifact types side by side: `war`, `jar`, `oci`, `lambda`, `function`, `assets`, `job` (with and without schedule), and `artifact` (catch-all). Useful as a syntax reference for the physical structure view.

### `org/system.krs`

An EC platform with a **full organization diagram**. Shows `organization`, nested `team`, `member`, `owns`, and contact properties (`slack`, `github`). Demonstrates sub-teams and team ownership of services and domains.

## Feature Samples

`feature-samples/` contains small, self-contained files that each exercise one language feature.
Useful for isolating rendering bugs and providing minimal reproducible cases.

| File | Feature demonstrated |
|------|---------------------|
| [`minimal.krs`](feature-samples/minimal.krs) | Smallest valid input — `system` + 2 `service` + sync/async edges |
| [`users.krs`](feature-samples/users.krs) | `[human]` and `[ai]` user nodes with `role` and `description` |
| [`edges.krs`](feature-samples/edges.krs) | Sync `->` and async `-->` edges, with and without labels |
| [`annotations.krs`](feature-samples/annotations.krs) | All four annotations: `@deprecated`, `@new`, `@experimental`, `@migration_target` |
| [`external-nodes.krs`](feature-samples/external-nodes.krs) | `[external]` tag on `service` and `resource` |
| [`domain-drill.krs`](feature-samples/domain-drill.krs) | Full hierarchy: `system` → `service` → `domain` → `usecase` → `resource` |
| [`deploy-all.krs`](feature-samples/deploy-all.krs) | All deploy artifact types: `war`, `jar`, `oci`, `lambda`, `function`, `assets`, `job`, `artifact` |
| [`domain-drift.krs`](feature-samples/domain-drift.krs) | Same domain `id` in two services — triggers a drift warning |
| [`legend.krs`](feature-samples/legend.krs) | `legend` block — `swatch` + `ref` entries, unscoped + per-view scope |
| [`resource-operations.krs`](feature-samples/resource-operations.krs) | `operations` property on `resource` — comma-separated, multi-line, omission |

## Directory layout — `en/` and `ja/`

Every example lives under `examples/<lang>/<name>/`. `en` and `ja` are matched
variants of the same model: identical structure and identical `.krs` file sets,
differing only in the `label` / `description` / `role` strings. Both are rendered
into the documentation gallery ([ADR-1642](../docs/adr/1642-en-ja-example-parity.md)).

### en-only examples (and why)

Three entries are deliberately English-only. ADR-1642's headline reads
unconditional, so the exception classes are named here once, and
`packages/docs-site/scripts/lib/examples-manifest.ts` points back at this
section rather than re-explaining each case at its call site (#2310).

An example may be en-only when it falls into one of these classes:

| Class | Why a `ja` copy would not help | Current members |
|---|---|---|
| **Code-first** — the content is `.krs` snippets, not prose | The snippets are the same in either locale; only the surrounding captions carry language, and those are localized in the manifest | `feature-samples/` |
| **Protocol / vocabulary is English** — the model's labels are the names of an external specification | Translating `capability camera` or an MCP method name would make the example less accurate, not more accessible | `client-mcp/` |
| **A model of a real system** — the labels are that system's own vocabulary | Same reason as above, plus: a second copy is a second thing to keep true as the real system changes | `hato/` |

Anything outside these classes gets a `ja` counterpart. If you find yourself
wanting a fourth class, add it to this table in the same PR — an unexplained
en-only directory is indistinguishable from a forgotten translation, which is
exactly what #2310 was filed about.

`hato/` carries one extra obligation: it is the **measured model** behind
[ADR-1724](../docs/adr/1724-system-view-infra-external-tier-split.md) and
[ADR-1728](../docs/adr/1728-external-on-sides-layout.md) (33 → 0 edge crossings),
so [`docs/acceptance/1728-external-on-sides.md`](../docs/acceptance/1728-external-on-sides.md)
renders it from this path. Its `hato.krs.style` `column` override is load
bearing — changing either file changes what those records measured.

## How to use

**Single file** (all themed scenarios + 01–04 + feature-samples):
Open in the karasu web app or VSCode Extension — paste into the editor.

**Multi-file** (05-multifile, 06-deploy):
Use VSCode Extension with the folder open, or run `karasu serve <directory>` in server mode.

## GitHub Actions

`github-actions/` contains workflow templates for automatically generating SVG diagrams in CI.
See [`github-actions/README.md`](github-actions/README.md) or the full guide at [`docs/github-actions.md`](../docs/github-actions.md).
