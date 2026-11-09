---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A `.krs.style` sheet that two files in one import graph `@import` is now loaded once, with no warning; it used to report `circular-style-import` for a cycle that cannot exist, since a sheet cannot `@import` (#3513). That diagnostic is retired. An `@import` in an imported `.krs` now resolves against that file's own directory instead of the entry file's, so a file in a subdirectory finds the sheet beside it rather than reporting `style-file-not-found` (#3714). A model that relied on the old behavior, with the sheet beside the entry file, now gets `style-file-not-found`: move the sheet next to the file that imports it, or write the path relative to that file (`../theme.krs.style`). The syntax and diagnostics references say so.
