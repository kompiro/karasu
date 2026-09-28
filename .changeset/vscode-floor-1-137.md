---
"karasu-vscode": minor
---

Raise the minimum VS Code version to 1.137. `engines.vscode` keeps tracking
`@types/vscode`, so the extension is typechecked against exactly the API level it
advertises. VS Code ships weekly and auto-updates, so hosts at or above 1.137 are
the norm; installs on 1.125 through 1.136 stay on the previously published version.
