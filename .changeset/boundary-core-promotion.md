---
"@karasu-tools/core": minor
---

Promote `boundary` to core notation for `.krs language v2.0` (#2678, ADR-2678). The declaration, `contains` and the scoped declaration now carry a backward-compatibility promise, and so do the `boundary` / `boundary#<id>` style selectors. The reference panel stops flagging the `boundary` grouping construct as experimental; `facet` stays experimental until #2677. This release does not move the language version: `.krs language v1.x → v2.0` is recorded once, in the release that cuts v2.0 after every v2.0 act has landed.
