---
"karasu": minor
---

Commands no longer crash or print "File not found" when given a directory (#3106). `karasu fmt`, `tidy-style` and `lint-style` now work on every matching file under a directory argument, and `karasu diff` reads each directory's `index.krs`, as `render` does. `remove`, `insert`, `apply`, `append` and `translate` say the path is a directory and ask for a file.
