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

## Themed Scenarios

All themed scenarios are **single-file** — paste into the karasu web app or VSCode Extension to try immediately.

### `hr-tool/system.krs`

A simple HR attendance tool. Demonstrates a shallow domain structure and side-by-side `[human]` / `[ai]` users.

### `payment-platform/system.krs`

A payment processing platform with multiple `[external]` services and a deploy diagram covering all major artifact types (`jar`, `oci`, `lambda`, `job`, `assets`). Includes a `.krs.style` file showing team-based color theming (requires multi-file support to apply).

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

## How to use

**Single file** (all themed scenarios + 01–04 + feature-samples):
Open in the karasu web app or VSCode Extension — paste into the editor.

**Multi-file** (05-multifile, 06-deploy):
Use VSCode Extension with the folder open, or run `karasu serve <directory>` in server mode.
