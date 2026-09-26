---
"karasu": minor
---

Add `karasu check <file>`: validate a `.krs` project (imports included) and write nothing. It prints every diagnostic in the same format as `render` and exits 1 when any is an error, so a file that passes `check` renders.
