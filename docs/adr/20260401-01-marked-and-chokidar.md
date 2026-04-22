---
id: ADR-20260401-01
title: Adopt marked for Markdown rendering and chokidar for file watching
status: accepted
date: 2026-04-01
scope:
  packages:
    - core
    - cli
  domains:
    - dependencies
---

# ADR-20260401-01: Adopt marked for Markdown rendering and chokidar for file watching

## Status

Accepted

## Context

Two third-party libraries were introduced without an explicit adoption record:

- **marked** (`packages/app`) — renders the `description` field of architecture nodes from Markdown to HTML inside `NodeDetailPanel.tsx`.
- **chokidar** (`packages/cli`) — watches the `.krs` file directory for changes and notifies connected browser clients via Server-Sent Events (SSE) in `watcher.ts`.

This ADR documents why each library was chosen over its alternatives.

---

## Decision

### marked — Markdown → HTML rendering in the browser

Adopt `marked` as the Markdown-to-HTML renderer for `packages/app`.

#### Alternatives considered

| Library | Bundle size (min) | API complexity | Notes |
|---|---|---|---|
| **marked** ✓ | ~30 KB | Low — `marked.parse(str)` | CommonMark-compliant, high-frequency releases |
| markdown-it | ~60 KB | Medium | Rich plugin ecosystem, but overkill for this use case |
| remark / unified | Large (full pipeline) | High — requires assembler + plugins | AST-based; ideal for build-time transforms, not browser rendering |
| showdown | ~40 KB | Low | Infrequent releases, lower spec compliance |

#### Reasons for choosing marked

1. **Minimal API surface** — `marked.parse(text, { async: false })` returns HTML in a single call. The `description` field is a display-only value; no AST traversal or plugin pipeline is needed.
2. **Small browser bundle** — `packages/app` targets the browser. marked's ~30 KB footprint is roughly half that of markdown-it and significantly smaller than the full remark/unified pipeline.
3. **Clear XSS boundary** — marked outputs unsanitized HTML by design. Sanitization is delegated explicitly to `DOMPurify`, keeping the security responsibility visible at the call site rather than hidden inside a library option.
4. **Feature fit** — node descriptions are expected to contain headings, bullet lists, and code blocks. The extended Markdown features offered by remark plugins are not required.
5. **Active maintenance** — marked publishes frequent releases and addressed two ReDoS vulnerabilities promptly (see ADR-20260331-01).

---

### chokidar — file-system watching in the CLI

Adopt `chokidar` as the file watcher for `packages/cli`.

#### Alternatives considered

| Library | Cross-platform reliability | API | Notes |
|---|---|---|---|
| **chokidar** ✓ | High | Event-emitter (`on("change", ...)`) | Wraps fs.watch/inotify/kqueue with a unified API |
| Node.js `fs.watch` | Low | Callback-based | Known inconsistencies on Linux (missing events, spurious events) and macOS (path encoding issues) |
| node-watch | Medium | Thin wrapper over fs.watch | Inherits many fs.watch limitations |
| nsfw (native) | High | Callback-based | Native binaries require platform-specific compilation; adds build complexity |

#### Reasons for choosing chokidar

1. **Cross-platform consistency** — Node.js's built-in `fs.watch` has well-documented reliability gaps: on Linux it can miss rapid successive writes; on macOS it sometimes reports incorrect paths. chokidar normalises these differences across platforms.
2. **Familiar event-emitter API** — `watcher.on("change" | "add" | "unlink", handler)` maps naturally onto the three SSE notification types the CLI needs to emit. No adapter layer is required.
3. **No native compilation** — Unlike nsfw, chokidar is pure JavaScript/TypeScript, eliminating the need for platform-specific build steps in CI or user environments.
4. **ESM-first from v5** — chokidar 5 (currently in use) is ESM-only and requires Node.js ≥ 20.19, both of which align with the CLI package's existing `"type": "module"` declaration and the CI Node.js 22 baseline (see ADR-20260331-01).
5. **Battle-tested** — chokidar is a dependency of Vite, esbuild, and other major build tools, providing high confidence in correctness and long-term maintenance.

---

## Consequences

**Positive:**

- Both libraries have simple, well-understood APIs that keep the implementation in `NodeDetailPanel.tsx` and `watcher.ts` concise.
- The security boundary for Markdown rendering (marked outputs HTML; DOMPurify sanitizes it) is explicit and auditable.
- chokidar's cross-platform abstraction removes the need for OS-specific workarounds in the CLI watcher.

**Negative:**

- chokidar 5's ESM-only constraint and Node.js ≥ 20.19 requirement must be maintained going forward. Any future environment running an older Node version would be incompatible.
- marked's unsanitized output means `DOMPurify.sanitize()` must never be removed from the rendering path; this is a standing requirement for maintainers.

## Re-evaluation triggers

- If node descriptions require rich transformations (e.g., custom directives, diagram embeds), remark/unified should be reconsidered.
- If the CLI needs to support environments where native file-system events are unavailable (e.g., some container or network-drive setups), a polling fallback strategy should be evaluated.
