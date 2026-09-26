---
"karasu": patch
---

Fix the `--help` Examples of `karasu append`, `apply` and `insert`: they taught `label: "…"`, which the parser rejects, and a `usecase` placed directly under a `service`, which the validator warns about. Every `.krs` snippet in `--help` is now parse-checked by a test.
