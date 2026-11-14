---
"@karasu-tools/core": patch
"karasu": patch
---

`wrapSvgForOgpFrame` now writes only a hex colour (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) as the frame background and falls back to `#ffffff` for anything else, so a background value can no longer add markup to the SVG. The check is exported as `parseOgpBackground`, with the fallback as `DEFAULT_OGP_BACKGROUND`.
