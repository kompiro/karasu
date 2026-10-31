---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

A sync dependency cycle is now marked when the model is parsed (or, for a project, when its imports are merged) instead of as a side effect of computing warnings, so a parsed model renders the same no matter what ran on it before (#2791). Models with a cycle now draw it in red on every single-model view: the All-layers panel, the live entity view, the drill-down SVG export and `buildDrawio` used to show those edges as plain edges. Diff views keep drawing them plainly, as they always have. The `[cyclic]` entry in the tags reference now says when the tag is assigned.
