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

## How to use

**Single file** (all themed scenarios + 01–04):
Open in the karasu web app or VSCode Extension — paste into the editor.

**Multi-file** (05-multifile, 06-deploy):
Use VSCode Extension with the folder open, or run `karasu serve <directory>` in server mode.
