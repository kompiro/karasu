---
id: ADR-20260404-03
title: Do not implement PNG export
status: not_adopted
date: 2026-04-04
topic: renderer
scope:
  packages:
    - core
---

# ADR-20260404-03: Do not implement PNG export

## Status

Rejected

## Context

Issue #105 proposed adding a first-party PNG export feature to karasu.
The intended use case was environments that do not support SVG (e.g., certain document editors or image-only upload fields).

The proposed implementation was to rasterize the current SVG using the browser Canvas API:

1. Serialize the SVG string to a Blob.
2. Draw it into a `<canvas>` via `drawImage()` (HTMLImageElement from object URL).
3. Call `canvas.toBlob('image/png')` and trigger a download.

Resolution options (1×, 2×, 4×) would scale the canvas dimensions accordingly.

## Decision

Do not implement PNG export inside karasu.

## Reasons

### 1. SVG is universally supported

Modern browsers, operating systems, and documentation tools (Notion, Confluence, GitHub, Google Docs, etc.) all support SVG natively. The "SVG-unsupported environment" use case is increasingly rare and does not justify adding feature complexity to the tool.

### 2. External tools cover the need adequately

Several well-maintained tools can convert karasu's exported SVG to PNG without any changes to the application:

| Tool | How to use |
|---|---|
| `rsvg-convert` (librsvg) | `rsvg-convert diagram.svg -o diagram.png` |
| Inkscape CLI | `inkscape --export-type=png diagram.svg` |
| ImageMagick | `convert diagram.svg diagram.png` |
| Convertio (online) | Upload SVG at https://convertio.co/svg-png/ |

### 3. Canvas rasterization adds browser-only complexity

The Canvas API is a browser-only feature. Supporting it correctly (handling SVG `viewBox`, HiDPI scaling, cross-origin images, etc.) adds non-trivial complexity to the `app` package for a use case that is already covered externally.

## Consequences

- Issue #105 is closed as "not planned".
- karasu continues to export SVG only.
- Users who need PNG are directed to external CLI tools or online converters.
- If a compelling use case that cannot be addressed by external tools emerges, this decision can be revisited.

## Re-evaluation triggers

- A concrete environment is identified where SVG is not supported and external conversion tools are not available.
- karasu gains a server-side rendering component that could handle rasterization without browser API constraints.
