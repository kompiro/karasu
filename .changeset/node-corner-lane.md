---
"@karasu-tools/core": minor
"karasu": minor
---

Node cards pack everything in their top-right corner into one right-packed lane — `[i] [D] [chip]` — so the annotation badge and the info / deploy buttons can no longer overlap. The badge moves from a circle floating outside the card, where it collided with incoming edges and neighbouring cards, to an inset pill whose label elides at 40% of the card width instead of being clipped. Its text takes whichever ink reads better on the pill.

Static output (`karasu render`, `/render`, exports) no longer draws the i / D buttons: they are affordances only a live preview can honour. Issue #2420.
