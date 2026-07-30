---
"@karasu-tools/core": minor
"karasu": minor
---

Nesting a logical node outside its parent's documented children now emits the `node-not-in-context` warning (#2165). The **May contain** column of the Logical structure table is the single definition of the rule, and the parser enforces it: a `usecase` written inside a `client`, for example, is still parsed and drawn but is reported as carrying no defined meaning there. A `domain` declared directly inside a `system` is now recognised as a valid placement (a domain not yet assigned to a service) and no longer differs between the spec and the implementation. This is a warning, not an error — `.krs` v1.0 is frozen (ADR-1314), so every file that parses today keeps parsing; promotion to an error is registered to the Syntax 2.0 program (#2162).
