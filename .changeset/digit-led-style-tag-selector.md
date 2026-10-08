---
"@karasu-tools/core": patch
"karasu": patch
---

A `.krs.style` tag selector whose name starts with a digit, such as `[3d-secure]` or `[2026-q3]`, now reads as one name, the same name the `.krs` tag lands on. It used to stop at `3d` and report three token-type errors. Because such a tag is outside the tool vocabulary, the rule now gets `style-tag-selector-not-builtin`, which names the tag you wrote. (#2849)
