---
"karasu": patch
---

`client` is now resolved as a valid `realizes` / `owns` target. Relationships pointing at a `client` node no longer fail to link, so client-facing ownership and realization edges render correctly. Fixes #1721.
