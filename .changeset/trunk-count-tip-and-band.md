---
"@karasu-tools/core": patch
"karasu": patch
---

Read a fan-in trunk by count in the Group-by view. Edges into one shared target
still merge onto one spine and one entry, which is what the aggregation is, but
the drawing now says how many: the merge mark carries the number the spine holds
onward instead of being a bare dot, and the spine is drawn as a band that wide,
carried through the shared run into the target. A trunked edge's label moves to
the stub only that edge owns, so N labels no longer stack along a line that
names none of them. Where a crossing rides a band, its arc is widened and
raised to stay outside it, and the count steps along the spine rather than
covering it: a crossing that cannot be seen reads as a connection. Routes,
ports and canvas size are unchanged.
