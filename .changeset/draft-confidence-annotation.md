---
"@karasu-tools/core": minor
"karasu": minor
---

Add the `@draft` builtin annotation, with an optional `confidence` parameter.

`@draft` marks a statement the model makes but nobody has confirmed. It exists
so a `.krs` that was reverse-engineered rather than written by hand can say
which parts it guessed at, instead of inviting the reader to trust all of it
equally.

```krs
service Reconciliation @draft(confidence: "low")
domain Settlement @draft
```

A bare `@draft` is complete; `confidence` takes `low` / `medium` / `high`, and
any other string is kept verbatim as a display-only value rather than being
rejected. The mark is per node, not per document, because a generated
decomposition errs at judgement-call seams rather than uniformly. karasu never
warns about, downranks or refuses to render a low-confidence node: penalising
the mark would just remove the mark.

`@draft` renders with a ✎ badge in both themes. A node renders one badge, and
`@draft` is ordered to win that tie: it is the mark that changes how a reader
should treat everything else on the node.

`NodeMetadata.draft` carries the interpreted level for consumers to read. No
surface displays it yet — the badge is the effect that ships here; a detail-panel
row is a separate change.

**Behaviour change for anyone already writing `@draft`**: it was accepted as a
non-builtin annotation and warned with `annotation-not-builtin`. That warning
no longer fires for it, and a `@draft(confidence: …)` parameter that previously
produced `annotation-param-unsupported` is now recognised. Both changes remove
a warning rather than adding one.

**The language version does not move.** `@<identifier>` already accepts any
identifier under `.krs language v1.0`, so the grammar is unchanged and the
freeze in ADR-1314 is untouched; what grows is the tool-owned builtin
vocabulary, admitted through the three-question gate in TPL-2172 (register:
lifecycle, since it describes the state of a statement in a review process;
no existing construct expresses it, since `@experimental` describes the
subject's maturity rather than our confidence in the description; stopping
rule: one binary axis, "has a human confirmed this").
