---
"@karasu-tools/core": patch
"karasu": patch
---

Fix the drill-down "← Back" control being buried under the level canvas rect in the bundled all-views SVG and its popup preview. The back button is now painted after the level content so it stays visible and clickable, restoring Back navigation (#2044).
