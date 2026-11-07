---
"@karasu-tools/core": patch
"karasu": patch
---

`.krs.style` selectors now match ids made only of hex digits, such as `#face`, `edge#feed` and `edge#face->db`, and keep a hex-shaped first segment whole in `#Feed.Items` and `edge#abc--d->c`. They used to be lexed as colors, so the rule matched nothing or did not parse (#3520).
