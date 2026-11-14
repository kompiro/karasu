---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

`Diagnostic["severity"]` is now typed per code: each code's `severity` is the one severity it is emitted at, so a diagnostic built with any other severity fails the type check. Code outside karasu that builds a `Diagnostic` from a `DiagnosticSeverity`-typed variable has to narrow it first. The diagnostics catalog (and the copy bundled with the skills) now lists `empty-crud-decoration` as the error it has always been emitted as, not a warning.
