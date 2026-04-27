---
id: ADR-20260416-01
title: HTML サニタイズに DOMPurify を採用
status: accepted
date: 2026-04-16
topic: build
scope:
  packages:
    - app
    - core
  concerns:
    - security
    - dependencies
---

# ADR-20260416-01: HTML サニタイズに DOMPurify を採用

## Status

Accepted

## Context

karasu renders user-facing HTML in two places:

1. **NodeDetailPanel** — displays Markdown descriptions from `.krs` node metadata. The `marked` library converts Markdown to HTML, which is then injected via `dangerouslySetInnerHTML`.
2. **ChatPane** — renders Markdown in AI chat assistant messages, also via `marked` + `dangerouslySetInnerHTML`.

Both paths accept content that may originate from user-authored `.krs` files or from external AI API responses. Injecting unsanitized HTML into the DOM opens a cross-site scripting (XSS) vector: a crafted Markdown string could embed `<script>`, `<img onerror>`, or other executable payloads.

`marked` is a Markdown-to-HTML compiler and explicitly does **not** sanitize its output. Its documentation recommends pairing it with a dedicated sanitizer.

### Why DOMPurify

Three sanitization approaches were considered:

| Approach | Pros | Cons |
|----------|------|------|
| **DOMPurify** | Battle-tested (used by Mozilla, WordPress); actively maintained; DOM-based parsing avoids regex bypass classes; small bundle (~7 kB gzipped) | Requires a DOM environment (fine for browser; needs jsdom in tests) |
| **sanitize-html** | Configurable allowlists; works in Node without DOM | Regex-based parsing; historically more CVEs; larger surface area |
| **Trusted Types API** | Browser-native; zero runtime dependency | Not universally supported; does not sanitize — only enforces policy boundaries; still needs a sanitizer underneath |

DOMPurify was chosen because:

- It parses HTML through the browser's own DOM parser, making it resistant to the parser-differential attacks that have affected regex-based sanitizers.
- It is the de facto standard recommended by OWASP for client-side HTML sanitization.
- `marked`'s own documentation suggests DOMPurify as the sanitizer to pair with.
- The bundle size impact is negligible relative to Monaco Editor and React already in the dependency tree.

## Decision

Use DOMPurify to sanitize all HTML produced by `marked` before injecting it into the DOM.

The sanitization call is `DOMPurify.sanitize(markedOutput)` with default configuration (strips all scripts, event handlers, and dangerous elements while preserving safe formatting tags).

## Consequences

**Positive:**

- Eliminates XSS risk from Markdown rendering in both NodeDetailPanel and ChatPane.
- Default DOMPurify configuration is secure-by-default — no allowlist tuning required.
- DOMPurify receives regular security updates via Dependabot (PR #665 is the first such update: 3.3.3 → 3.4.0).

**Negative:**

- Adds a runtime dependency. DOMPurify is mature and well-maintained, but it is one more package to keep updated.
- If server-side rendering (SSR) is introduced in the future, DOMPurify requires jsdom or a similar DOM shim. This is not a concern today since karasu is a purely client-side SPA.

## Related

- PR #3 — initial introduction of DOMPurify (NodeDetailPanel)
- PR #635 — extended DOMPurify usage to ChatPane for AI chat Markdown rendering
- PR #665 — DOMPurify 3.3.3 → 3.4.0 security update (trigger for this ADR)
