---
"@karasu-tools/core": patch
"karasu": patch
"karasu-vscode": patch
---

Draw an unpainted container frame in the theme's chrome instead of the cascade's card default (#2662). A group frame and a ghost ancestor container took their title and outline from `DEFAULT_NODE_STYLE`, which is hard-coded to the dark palette, so on the light theme the title was near-white (`#F9FAFB`) on a white canvas. Both now fall back to the chrome palette's `textPrimary` / `mutedBorder`, the roles `org-tree-renderer.ts` already names for the same two jobs. A colour any rule names is unaffected: the fallback is chosen from which properties the cascade applied, so naming the base hex on purpose is honoured rather than read as silence.
