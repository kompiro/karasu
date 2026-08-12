---
"@karasu-tools/core": minor
---

Export the WCAG contrast helpers (`contrastRatio`, `compositeOver`,
`WCAG_AA_NORMAL_TEXT`, `WCAG_AA_LARGE_TEXT`) from the package entry point. They
already fenced the builtin themes' canvas text internally; exporting them lets
the app's CSS token layer judge its palette with the same implementation, so
chrome and diagram cannot disagree about what passes (#2193).
