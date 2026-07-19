---
"@karasu-tools/core": minor
"karasu": minor
---

Export a shared node-detail-panel field descriptor from `@karasu-tools/core`: `NODE_DETAIL_PROPERTY_FIELDS` (the ordered `{ metaKey, emoji, label }` rows for a node's runtime/type/image/schedule/realizes properties), the `NODE_DETAIL_ROLE_EMOJI` / `NODE_DETAIL_TAGS_EMOJI` / `NODE_DETAIL_TEAM_EMOJI` glyph constants, and the `NodeDetailPropertyField` type. These were previously hand-mirrored between the app's React detail panel and the VS Code webview's string-built panel — with the emoji, labels, and row order duplicated in two places and already drifting. Both renderers now derive that content from this single spec. No `.krs` / `.krs.style` parsing or rendering behavior changes; the detail panels render identically to before.
