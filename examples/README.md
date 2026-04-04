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

### `hr-tool/`

A simple HR attendance tool. Demonstrates a shallow domain structure and side-by-side `[human]` / `[ai]` users.

### `payment-platform/`

A payment processing platform with multiple external services and a rich deploy diagram covering all artifact types (`jar`, `oci`, `lambda`, `job`, `assets`). Includes a `.krs.style` file showing team-based color theming.

### `migration/`

A system mid-migration from a legacy monolith to microservices. Demonstrates `@deprecated`, `@migration-target`, and `@experimental` annotations, and intentionally triggers a **domain drift warning** (same domain id in two services within the same system).

## How to use

**Single file** (01–04, hr-tool, migration, payment-platform/system.krs):
Open in the karasu web app or VSCode Extension — paste into the editor.

**Multi-file** (05-multifile, 06-deploy, payment-platform):
Use VSCode Extension with the folder open, or run `karasu serve <directory>` in server mode.
