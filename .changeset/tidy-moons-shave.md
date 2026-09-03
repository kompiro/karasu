---
"karasu": patch
"karasu-vscode": patch
---

Resolve the display language by the whole primary subtag instead of a `ja` prefix, so a user whose environment reports Javanese (`jav`, `jav-ID`) or Jamaican Creole (`jam`, `jam-JM`) gets the English fallback rather than a Japanese UI. Japanese keeps resolving from every form the surfaces report, including the POSIX modifier (`ja@cjknarrow`) and Windows' `Japanese_Japan.932`.
