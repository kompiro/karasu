---
"@karasu-tools/core": patch
"karasu": patch
---

Draw a crossing so it reads as a crossing. The hop arc's radius goes from 4px to
6px in every view: 4px was chosen when nothing competed with the arc, and on a
real model at 6x zoom it reads as a nick in the line rather than a mark, which
is the one thing the mark must not do. 6px is the ceiling, bounded by the
spacing of the ports along one card side rather than by the lane pitch, and a
raise past it now fails a fence instead of degrading quietly.

Also fixes an arc that was drawn flat inside the trunk band it hops. The taller
arc a band-riding crossing is given never reached the SVG, because the renderer
wrote the default radius as every arc's height, so a crossing over a wide band
read as a line merging into it. Routes, ports and canvas size are unchanged.
