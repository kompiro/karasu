---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
"karasu-skills": patch
---

A usecase can reference the local storage a client declares (#3794, experimental). Give the storage line an id, `resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"`, and a usecase's `resource WebApp.ApiKey` resolves to it instead of raising `unresolved-resource-ref` (KRS048). The domain view labels it `<name> (<storageKind>)`, the CRUD matrix gets a column per identified storage, `karasu coverage` reports a `clientStores` section, the detail panel lists each storage's id and the usecases that reference it, and the language server completes and jumps to storage ids. New diagnostics: `resource-target-ambiguous` (KRS115) and `client-resource-duplicate-id` (KRS116). `extractCrudMatrix` / `extractCoverage` take an optional model-wide `physicalTargets` index, which the compile result now carries. A promoted resource card is now sized for the label it draws, so a long infra or client storage label no longer overflows its box. The language version stays 2.0.
