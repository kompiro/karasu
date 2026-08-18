---
"karasu-vscode": minor
---

Raise the minimum VS Code version to 1.125. `engines.vscode` now tracks
`@types/vscode`, so the extension is typechecked against exactly the API level it
advertises. VS Code ships weekly and auto-updates, so hosts at or above 1.125 are
the norm; installs on 1.111 through 1.124 stay on the previously published version.
