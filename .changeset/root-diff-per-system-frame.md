---
"@karasu-tools/core": patch
"karasu": patch
---

Compare mode on a multi-system root view now gives every system's services their own diff state, and draws a service removed from any system inside that system's frame. Adding or removing the first system no longer shows another system's unchanged services as removed and added (#3126).
