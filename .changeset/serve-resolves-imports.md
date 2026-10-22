---
"karasu": patch
---

`karasu serve` now resolves imports. The preview mirrors every `.krs` and `.krs.style` in the served directory at its real path, so whole-file, named, directory and `@import` style imports work as they do in `karasu render`, files in subdirectories resolve relative imports from their own folder, and saving any imported file or style sheet redraws the preview (#3258).
