---
"@karasu-tools/core": patch
"karasu": patch
---

Diagnostic locations now point at the file and line they are about (#2715). In a multi-file project, `karasu render` used to print a problem found in an imported file (or decided across files) as a line of the entry file, often one that did not exist; it now prints that file's path. Printed lines and columns were also one too high, even in a single file, and are now exact. A `.krs.style` syntax error is reported against the sheet, with its line. `SourceRange` gains an optional `file`, set when `Parser.parse` / `StyleParser.parse` are given a path.
