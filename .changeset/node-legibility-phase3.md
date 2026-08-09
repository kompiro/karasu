---
"@karasu-tools/core": minor
"karasu": minor
---

Node shape legibility (#2366 proposals F + G): shapes now declare a content inset mirroring their drawn geometry, so node text clears the cylinder's top ellipse, the queue's end cap, the hexagon's side notches and the cloud's wavy outline, and centres on the shape's visual body; hexagon (and wide cloud) cards grow so the notches no longer eat into the measured text width. The `user` shape is redrawn as a rounded card with a fixed-size person medallion on the top edge — wide user nodes no longer degrade into a stretched silhouette, and their text centres on the card below the medallion.
