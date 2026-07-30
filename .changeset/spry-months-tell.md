---
"@karasu-tools/core": minor
"karasu": minor
---

Publish the language version (`.krs language v1.0`): new `KRS_LANGUAGE_VERSION` export in core, and `karasu --version` now prints two lines — the real package version (fixing the previously hardcoded `0.0.0`) and the language version the build implements (ADR-2124).
