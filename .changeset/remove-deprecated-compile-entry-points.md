---
"@karasu-tools/core": minor
"karasu": minor
---

Remove the deprecated compile entry points from `@karasu-tools/core` (#3346). `compile` and `compileProject` now take only a `CompileOptions` object. The removed exports and their replacements:

- `compile(krsSource, styleSource?, viewPath?, diagramType?, selectedDeployId?, displayMode?)` → `compile(krsSource, { styleSource, viewPath, diagramType, selectedDeployId, displayMode })`
- `compileProject(entryPath, fs, viewPath?, diagramType?, selectedDeployId?, displayMode?)` → `compileProject(entryPath, fs, { viewPath, diagramType, selectedDeployId, displayMode })`
- `compileOrgView(krsSource, styleSource?, orgPath?)` → `compile(krsSource, { diagramType: "org", styleSource, viewPath: orgPath })`
- `compileProjectOrgView(entryPath, fs, orgPath?, displayMode?)` → `compileProject(entryPath, fs, { diagramType: "org", viewPath: orgPath, displayMode })`
