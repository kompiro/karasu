---
"@karasu-tools/core": patch
"karasu": patch
---

A `system` named in `import { … }` is no longer drawn twice when the importing file already holds it, from a whole-file import of the same file, an earlier named import, or its own declaration. The block is reopened, as a whole-file import does (#3801).
