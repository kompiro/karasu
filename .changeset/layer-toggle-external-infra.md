---
"@karasu-tools/core": minor
"karasu": minor
---

System view: collapse/expand the **external** and **infra** node categories to cut horizontal density on large diagrams. A new `collapsedCategories` render/compile option folds each collapsed category to a single ⊕ stub before layout, so the diagram reflows and edges to the hidden nodes drop (#1821).
