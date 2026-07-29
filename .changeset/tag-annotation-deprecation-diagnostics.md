---
"@karasu-tools/core": minor
"karasu": minor
---

Add `tag-not-builtin` / `annotation-not-builtin` deprecation warnings: any tag or annotation name outside the tool vocabulary (builtin tags + system-assigned tags / the four builtin annotations) is now warned as deprecated, pointing at the migration targets (the upcoming facet construct for membership labeling, builtin-addition requests for new archetypes / lifecycle states). Parse behaviour is unchanged (ADR-1314 freeze); syntax v2.0 will accept tool vocabulary only, still as a warning. Part A of the tags-and-facets design (#2159, refs #2065).
