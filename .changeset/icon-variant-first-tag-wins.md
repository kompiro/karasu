---
"@karasu-tools/core": patch
"karasu": patch
---

Icon Mode now draws a `resource` that carries more than one variant tag (for example `resource Orders [table, api]`) with the icon of the first variant tag written, as it already did for `client`. It used to show the variant declared last in the icon theme, so the Outline and the diagram showed the same node with different icons.
