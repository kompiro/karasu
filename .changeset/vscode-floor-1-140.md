---
"karasu-vscode": minor
---

Raise the minimum VS Code version to 1.140. `engines.vscode` keeps tracking
`@types/vscode`, so the extension is typechecked against exactly the API level it
advertises. VS Code auto-updates, so hosts at or above 1.140 are the norm; installs
on 1.137 through 1.139 stay on the previously published version.
