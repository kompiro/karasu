---
"@karasu-tools/core": patch
"karasu": patch
---

`table`, `queue-item` and `bucket` cards now take their store's colours (`database`, `queue`, `storage`) from the active theme. They used to fall back to a dark grey card in both the dark and the light theme (#3777).
