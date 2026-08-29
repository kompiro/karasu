---
"@karasu-tools/core": minor
"karasu": minor
---

Edges accept an optional property block, `A --> B [async] #id { label / description / link }`, giving them a place for prose and links that the positional label could never hold. The shorthand `A -> B "calls"` is unchanged and stays canonical: `karasu fmt` folds a block that carries nothing but a `label` back to it, and keeps a block that carries a `description` or a `link`. Writing the label both positionally and in the block is a new `duplicate-edge-label` error. Left-clicking an edge that carries a `description` or a `link` opens the edge detail panel. Also fixes `karasu fmt` silently deleting an edge's author-supplied `#<id>`, which removed the target of any `edge#<id>` style selector. Closes #2543.
