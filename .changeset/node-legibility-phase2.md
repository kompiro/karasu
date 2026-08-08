---
"@karasu-tools/core": minor
"karasu": minor
---

Node text legibility batch (#2366 proposals C/D/E): descriptions may widen cards up to 260px and wrap into two lines at word boundaries instead of truncating early (the Latin char-width estimate is now 0.8x, matching real sans-serif metrics); the meta row and client count chips draw theme-aware vector glyphs instead of emoji (🔗👥📦🔐), so SVG output no longer depends on the viewer having a color-emoji font; secondary text (description, role, meta row) inherits the node's text color at fixed opacities instead of low-contrast palette values, and the one edge label color below WCAG AA was fixed (dark edge[delivers] #8B5CF6 -> #A78BFA, 4.22 -> 6.56:1). Node sizes and layout positions shift accordingly.
