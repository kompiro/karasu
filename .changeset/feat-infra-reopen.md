---
"karasu": minor
---

Same-id `database` / `queue` / `storage` blocks declared in multiple `.krs` files now merge instead of erroring. A new `info` diagnostic (`infra-redeclared-across-files`) surfaces the fact for the App / LSP / CLI without prescribing how to fix it — shared infrastructure is a structural fact karasu visualizes but does not refuse to model. See `docs/spec/syntax.md` §"Multi-file import semantics" S4.5 for the full rules and recommended pattern (declare once in `infra.krs`, import everywhere).
