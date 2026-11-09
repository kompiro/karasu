---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A `.krs.style` sheet that two files in one import graph `@import` is now loaded once, with no warning; it used to report `circular-style-import` for a cycle that cannot exist, since a sheet cannot `@import` (#3513). That diagnostic is retired. An `@import` in an imported `.krs` now resolves against that file's own directory instead of the entry file's, so a file in a subdirectory finds the sheet beside it rather than reporting `style-file-not-found` (#3714). The syntax and diagnostics references say so.
