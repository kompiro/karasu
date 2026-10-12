---
"@karasu-tools/core": patch
"karasu": patch
---

The default `karasu render` and `karasu check` (no `--view`) now apply the `.krs.style` sheets a model `@import`s and report their warnings, as `karasu render --view <x>` already did. Before, the bundled SVG was drawn in builtin styles and warnings such as `style-unknown-property`, `style-unknown-icon` and `style-column-invalid-value` were not printed (#3097).
