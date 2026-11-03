---
"@karasu-tools/core": minor
"karasu": minor
---

Dense views now open room for the edge labels `label-display: auto` could not seat. The channels between rows grow by the withheld labels' heights, and, where that seats more, the gaps inside rows grow by their widths. A view keeps the extra room only when it seats strictly more labels, so views whose labels already fit are unchanged (#3036).
