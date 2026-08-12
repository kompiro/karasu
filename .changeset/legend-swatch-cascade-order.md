---
"@karasu-tools/core": patch
"karasu": patch
---

Fix legend swatches ignoring the cross-sheet declaration order, so a `.krs.style` rule that ties a built-in rule on specificity now wins on the swatch exactly as it does on the node it stands for (#2445). The cascade itself moved into one shared function that both the style resolver and the legend read.
