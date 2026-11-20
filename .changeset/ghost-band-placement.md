---
"@karasu-tools/core": minor
"karasu": minor
"karasu-skills": patch
---

Entity views and service views no longer put every cross-domain ghost in one row below the frame. Ghosts that reference the focused domain (or service) sit above its frame, the ones it references sit below, two or more ghosts of one foreign domain (or service) on a side share a muted frame titled with it, and the band wraps to keep the canvas screen-shaped (#3880, #2823). Connectors are still straight lines for now (#3881).
