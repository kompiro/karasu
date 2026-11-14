---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

`Diagnostic["severity"]` is now typed per code from `DIAGNOSTIC_SEVERITY`, so a diagnostic built with a severity its code is never emitted at fails the type check. The diagnostics catalog (and the copy bundled with the skills) now lists `empty-crud-decoration` as the error it has always been emitted as, not a warning.
