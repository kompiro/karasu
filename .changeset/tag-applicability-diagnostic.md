---
"@karasu-tools/core": minor
"karasu": minor
---

Warn when a builtin tag is used on a node kind outside its applicability (`tag-not-applicable`).

`appliesTo` was declared for every builtin tag, exposed through the reference API and printed in the spec table, but nothing validated it — so `service Api [index]` parsed with exit 0, rendered no badge, and said nothing. From the author's side that is indistinguishable from a typo.

**Behaviour change:** models that were silently inert now emit a warning. Files still parse; nothing becomes an error. Two redundant spellings start warning in particular — `storage Bucket [storage]` and `queue Q [queue]`, because `[storage]` / `[queue]` are resource *shape* tags (`appliesTo: ["resource"]`) and carry no meaning on the infra block itself. Remove the tag, or move it to a `resource`.

The diagnostic never fires together with `tag-not-builtin`: a name outside the builtin set has no applicability to violate.
