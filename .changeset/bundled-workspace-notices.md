---
"karasu": patch
"karasu-vscode": patch
---

`THIRD_PARTY_NOTICES.md` now lists the dependencies of the karasu packages each bundle carries, so the license texts of `smol-toml`, `yaml` and `vscode-languageserver` ship with the code that uses them (#3137). The CLI's notices no longer list `@resvg/resvg-wasm`, which the CLI does not ship.
