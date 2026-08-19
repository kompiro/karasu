---
"@karasu-tools/core": patch
"karasu": patch
---

Fit node text to the card in icon display mode (#2533). A label longer than
the fixed 160px card used to be drawn at full length, running out of its card
and printing over the neighbouring label; it is now truncated with an ellipsis.
Descriptions wrap against the icon card's own width instead of the shape-mode
content box, which on a 160px card left 80px and broke them into two-word
stubs. Shape mode is unchanged.
