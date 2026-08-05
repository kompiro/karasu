---
"@karasu-tools/core": minor
"karasu": minor
---

A `.krs.style` sheet can now set a boundary frame's colour. `boundary#pci { border-color: #C0392B }` repaints one boundary and `boundary { border-style: solid }` every frame, mirroring the existing `edge` / `edge#<id>` pair down to the specificity (1 and 101). Boundaries a sheet does not name keep the cycled hue #2179 assigns. One `border-color` drives the stroke, the tint and the title together, since a boundary's colour is what lets two overlapping frames read as an overlap; `background-color` / `color` set them apart deliberately. `boundary` stays experimental notation (#2234).
