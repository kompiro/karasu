import type { Translations } from "./types.js";

/**
 * English translation map.
 *
 * Must be COMPLETE — the `Translations` type is the source of truth,
 * and the English map is the fallback for any key missing in other
 * locale maps. TypeScript will error if a new key is added to
 * `Translations` without a corresponding entry here.
 */
export const en: Translations = {
  "languageSelector.label": "Language",
  "languageSelector.english": "English",
  "languageSelector.japanese": "Japanese",

  // Theme selector
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // Settings pane
  "settings.ai.title": "⚙ AI settings",
  "settings.security.heading": "⚠ About security",
  "settings.security.bodyBrowser":
    "This tool uses your Claude API key directly in the browser. The key is stored only in this browser and is never sent to any external server.",
  "settings.security.bodyXss":
    "However, the key could leak if this page is compromised by an XSS attack. We recommend issuing a karasu-specific restricted key from the Anthropic console.",
  "settings.security.linkLabel": "→ Manage keys on console.anthropic.com",
  "settings.apiKey.label": "Claude API key",
  "settings.persist.label": "Persist across sessions (save to localStorage)",
  "settings.persist.hint":
    "When off, the API key is cleared when the tab closes (recommended). Persisting keeps the key readable by any script running on this page across sessions — if the page is ever compromised (XSS), a persisted key is exposed for far longer.",
  "settings.save.saved": "✓ Saved",
  "settings.save.label": "💾 Save",
  "settings.clear.label": "🗑 Clear",

  // ProjectMode bootstrap error screen (#1530)
  "projectInit.error.title": "Failed to load your projects.",
  "projectInit.error.hint":
    "This can happen if browser storage (OPFS) is unavailable — e.g. in private browsing or when storage is full. Check your browser settings and reload.",

  // Project selector
  "projectSelector.namePlaceholder": "Project name",
  "projectSelector.new.title": "New project",
  "projectSelector.new.button": "+ New",
  "projectSelector.rename.title": "Rename project",
  "projectSelector.rename.button": "✎ Rename",
  "projectSelector.delete.title": "Delete project",
  "projectSelector.delete.button": "✕ Delete",
  "projectSelector.delete.confirm": ({ name }) => `Delete "${name}"?`,
  "projectSelector.export.title": "Export as ZIP",
  "projectSelector.export.button": "↓ Export",
  "projectSelector.import.title": "Import from ZIP",
  "projectSelector.import.button": "↑ Import",
  "projectSelector.translate.title": "Translate an infra config to .krs",
  "projectSelector.translate.button": "⇄ Translate",
  "projectSelector.ok": "OK",
  "projectSelector.cancel": "Cancel",
  "project.error.create": ({ detail }) => `⚠ Failed to create project: ${detail}`,
  "project.error.rename": ({ detail }) => `⚠ Failed to rename project: ${detail}`,
  "project.error.delete": ({ detail }) => `⚠ Failed to delete project: ${detail}`,
  "project.error.export": ({ detail }) => `⚠ Failed to export project: ${detail}`,
  "project.error.import": ({ detail }) => `⚠ Import failed: ${detail}`,
  "project.error.snapshot": ({ detail }) => `⚠ Failed to capture snapshot: ${detail}`,
  "project.error.dismiss": "✕ Dismiss",

  // Translate dialog
  "translateDialog.title": "⇄ Translate infra config to .krs",
  "translateDialog.description":
    "Convert a Docker Compose, Kubernetes, OpenAPI, or DB schema file into a .krs scaffold.",
  "translateDialog.format.label": "Input format",
  "translateDialog.format.compose": "Docker Compose",
  "translateDialog.format.k8s": "Kubernetes manifest",
  "translateDialog.format.openapi": "OpenAPI spec",
  "translateDialog.format.db": "DB schema (SQL)",
  "translateDialog.loadHint": "Paste the source below, or load a file:",
  "translateDialog.loadFile": "📂 Load file…",
  "translateDialog.loadFile.aria": "Load a file",
  "translateDialog.sourceContent": "Source content",
  "translateDialog.advanced": "Advanced options",
  "translateDialog.sourceName.label":
    "Source name (used to derive the deploy / service / database name)",
  "translateDialog.sourceName.aria": "Source name",
  "translateDialog.service.label": "Service name (overrides info.title)",
  "translateDialog.service.aria": "Service name",
  "translateDialog.database": "Database name",
  "translateDialog.granularity.label": "Granularity",
  "translateDialog.granularity.resourceDefault": "resource (default)",
  "translateDialog.granularity.operation": "operation",
  "translateDialog.granularity.aggregateDefault": "aggregate (default)",
  "translateDialog.granularity.table": "table",
  "translateDialog.emitBindings": "Emit usecase → resource bindings",
  "translateDialog.emitCrudDecoration": "Decorate operations with <verb>:<crud>",
  "translateDialog.system.label": "Wrap in system block (optional)",
  "translateDialog.system.aria": "System name",
  "translateDialog.mapFile.label": "karasu.map.yaml content (optional — resolves `realizes`)",
  "translateDialog.mapFile.aria": "karasu.map.yaml content",
  "translateDialog.result": "Generated .krs",
  "translateDialog.close": "Close",
  "translateDialog.download": "↓ Download .krs",
  "translateDialog.copy": "⧉ Copy .krs",
  "translateDialog.translate": "⇄ Translate",
  "translateDialog.copyFailed":
    "Couldn't copy to the clipboard. Select the text and copy it manually.",
  "translateDialog.loadFailed": "Couldn't read the selected file.",

  // Chat pane
  "chat.newSession.button": "↺ New Session",
  "chat.startInterview.button": "▶ Start Interview",
  "chat.startReview.button": "🔍 Start Review",
  "chat.emptyState.hint": 'Or type freely (e.g. "Review this model")',
  "chat.message.userRole": "You",
  "chat.retry.button": "↺ Retry",
  "chat.openSettings.button": "⚙ Open Settings",
  "chat.loading": "AI is thinking…",
  "chat.input.placeholderPending": "Please review the patch before sending",
  "chat.input.placeholderDefault": "Type a message… (Cmd+Enter or Ctrl+Enter to send)",
  "chat.input.ariaLabel": "Chat message input",
  "chat.send.button": "↑ Send",
  "chat.patch.apply.button": "✓ Apply",
  "chat.patch.reject.button": "✕ Reject",
  "chat.apiKeySetup.message": "A Claude API key is required to use AI features.",
  "chat.apiKeySetup.goToSettings": "⚙ Configure in Settings",

  // Chat error messages
  "chat.error.auth": "⚠ The API key is invalid. Please set a valid key in Settings.",
  "chat.error.rateLimit": "⚠ Rate limit reached. Please wait a moment and retry.",
  "chat.error.server": "⚠ Anthropic server error. Please wait a moment and retry.",
  "chat.error.patchFailed": ({ detail }) => `⚠ Failed to apply patch: ${detail}`,

  // NodeDetailPanel
  "nodeDetail.close": "Close",
  "nodeDetail.links.title": "🔗 Links",
  "nodeDetail.openDeployView": "🚀 View in Deploy diagram →",
  "nodeDetail.jumpToEditor": "↗ Jump to editor",
  "nodeDetail.annotationDiff.title": "⇄ Annotation diff",
  "nodeDetail.resources.title": "📦 Storage resources",
  "nodeDetail.capabilities.title": "🔐 Capabilities",

  // Empty-state placeholders (rendered inside SVG by core renderers)
  "emptyState.deploy.title": "No deploy block defined",
  "emptyState.deploy.hint": "Add a deploy block to your .krs file",
  "emptyState.org.noTeams": "No teams defined",
  "emptyState.system.noNodes": "No nodes to render",
  "emptyState.org.placeholder": "No org diagram",
  "emptyState.system.noDiagram": "No diagram",

  // Built-in annotation badge labels (must match reference-data en labels)
  "badge.deprecated": "Deprecated",
  "badge.new": "NEW",
  "badge.experimental": "Experimental",
  "badge.migrationTarget": "Migration target",

  // ReferencePanel
  "referencePanel.unsupportedMessage": "Tags & Annotations are not available for this diagram.",
  "referencePanel.builtin.description":
    "Built-in default theme — applies to all diagram types (lowest cascade priority)",
  "referencePanel.samples.description": "Complete example — system + deploy + org",
  "referencePanel.copy.label": "Copy",
  "referencePanel.copy.copied": "Copied!",

  // Preview toolbar — export controls
  "preview.export.svg.label": "↓ Export SVG",
  "preview.export.svg.ariaLabel": "Export SVG",
  "preview.export.options.ariaLabel": "Export options",
  "preview.export.drillDown.label": "Export Drill-down SVG",
  "preview.export.allDiagrams.label": "Export All Diagrams SVG",
  "preview.export.drawio.label": "Export draw.io (mxGraph XML)",
  "preview.export.drawio.title":
    "Export to draw.io (mxGraph XML) — a layout escape hatch you can polish in diagrams.net",
  "preview.export.drawio.failed": ({ detail }) => `⚠ draw.io export failed: ${detail}`,

  // Warnings (rendered in the WarningPanel)
  "warning.domainDispersal.message": ({ domainId }) =>
    `Domain "${domainId}" appears under multiple services`,
  "warning.domainDispersal.checkCohesion":
    "DDD sometimes calls cross-service domain reuse a cohesion smell",
  "warning.sharedInfraFanIn.message": ({ infraKind, infraId, count }) =>
    `${infraKind} "${infraId}" is shared by ${count} services`,
  "warning.sharedInfraFanIn.checkDatabasePerService":
    "Microservices Database-per-Service sometimes calls a shared store a smell",
  "warning.unassignedDomain.message": ({ display }) =>
    `Domain "${display}" is not assigned to any service`,
  "warning.unassignedUsecase.message": ({ usecaseId }) =>
    `Usecase "${usecaseId}" is not assigned to any domain`,
  "warning.unassignedService.message": ({ display }) =>
    `Service "${display}" is not assigned to any system`,
  "warning.unassignedClient.message": ({ display }) =>
    `Client "${display}" is not assigned to any system`,
  "warning.unresolvedHandles.message": ({ nodeKind, nodeId, domainId }) =>
    `${nodeKind} "${nodeId}" declares handles "${domainId}" but no outgoing edge target exposes that domain`,
  "warning.unassignedDatabase.message": ({ display }) =>
    `Database "${display}" is not assigned to any system`,
  "warning.unassignedQueue.message": ({ display }) =>
    `Queue "${display}" is not assigned to any system`,
  "warning.unassignedStorage.message": ({ display }) =>
    `Storage "${display}" is not assigned to any system`,
  "warning.styleConflict.message": ({ selector }) =>
    `Selector "${selector}" is defined in multiple style files`,
  "warning.styleConflict.sheetLabel": ({ index }) => `Style file ${index + 1}`,
  "warning.missingRuntime.message": ({ nodeId }) =>
    `Deploy node "${nodeId}" has no runtime specified`,
  "warning.missingRealizes.message": ({ nodeId }) =>
    `Deploy node "${nodeId}" has no realizes specified`,
  "warning.unresolvedRealizes.message": ({ deployNodeId, target }) =>
    `Deploy node "${deployNodeId}" realizes "${target}" but no service or domain with that id exists`,
  "warning.invalidOwns.message": ({ teamId, ownedId }) =>
    `Team "${teamId}" owns "${ownedId}" but no service or domain with that id exists`,
  "warning.crossSystemRefUnresolved.message": ({ ref }) =>
    `"${ref}" could not be resolved — rendered as an unresolved external node`,
  "warning.unresolvedEdgeEndpoint.message": ({ from, to, unresolvedId }) =>
    `Edge "${from} → ${to}" references unknown node "${unresolvedId}"; the edge is dropped (the resolved endpoint is kept)`,
  "warning.crossSystemRefImplicitExternal.message": ({ ref, sourceSystemId, sourceNodeId }) =>
    `"${ref}" is referenced from ${sourceSystemId}.${sourceNodeId} but is not explicitly annotated as @external`,
  "warning.crossSystemRefImplicitExternal.suppressHint": ({ targetSystemId, sourceSystemId }) =>
    `Add 'service ${targetSystemId} [external]' to system ${sourceSystemId} to suppress this warning`,
  "warning.cyclicDependency.message": ({ path }) => `Circular dependency detected: ${path}`,
  "warning.deliversTargetNotClient.message": ({ serviceId, targetId }) =>
    `service "${serviceId}" delivers target "${targetId}" is not a client node`,
  "warning.clientCapabilityDuplicate.message": ({ clientId, name }) =>
    `client "${clientId}" declares capability "${name}" more than once`,
  "warning.annotationPossibleTypo.message": ({ nodeId, annotation, suggestion }) =>
    `"@${annotation}" on ${nodeId} — did you mean "@${suggestion}"?`,
  "warning.annotationPossibleTypo.openSetNote":
    "Annotation names are an open set; custom names are fine. This hint only fires for names close to a built-in.",
  "warning.legendRefUnresolved.message": ({ target, legendTitle }) =>
    legendTitle
      ? `legend "${legendTitle}": ref ${target} does not match any node or style rule`
      : `legend ref ${target} does not match any node or style rule`,
  "warning.styleColumnInvalidValue.message": ({ nodeId, value }) =>
    `column: "${value}" on #${nodeId} is not one of left / center / right — ignored`,
  "warning.styleColumnIgnoredNonSystemView.message": ({ nodeId, viewType }) =>
    `column hint on #${nodeId} is ignored in ${viewType} view (layout hints currently apply only to system view)`,
  "warning.styleInvalidEnumValue.message": ({ property, value, allowed }) =>
    `${property}: "${value}" is not one of ${allowed.join(" / ")} — ignored`,
  "warning.styleInvalidHexColor.message": ({ property, value }) =>
    `${property}: "${value}" is not a valid hex color (expected #RGB / #RGBA / #RRGGBB / #RRGGBBAA) — ignored`,
  "warning.styleMissingLengthUnit.message": ({ property, value, allowedUnits }) =>
    `${property}: "${value}" is missing a unit (expected ${allowedUnits.join(" / ")}) — ignored`,
  "warning.styleInvalidLengthUnit.message": ({ property, value, unit, allowedUnits }) =>
    `${property}: "${value}" uses unit "${unit}" (expected ${allowedUnits.join(" / ")}) — ignored`,
  "warning.styleOutOfRange.message": ({ property, value, min, max }) => {
    const range =
      min !== undefined && max !== undefined
        ? `[${min}, ${max}]`
        : min !== undefined
          ? `>= ${min}`
          : max !== undefined
            ? `<= ${max}`
            : "";
    return `${property}: ${value} is out of range ${range} — ignored`;
  },
  "warning.styleUnknownProperty.message": ({ property }) =>
    `unknown style property "${property}" — ignored`,

  // Diagnostics (rendered in PreviewPane's diagnostic banner)
  "diagnostic.tokenTypeMismatch.message": ({ expected, got, value }) =>
    `Expected ${expected} but got ${got} ("${value}")`,
  "diagnostic.unexpectedTokenRoot.message": ({ tokenType, value }) =>
    `Unexpected token: ${tokenType} ("${value}")`,
  "diagnostic.unexpectedTokenInBlock.subResource": ({ tokenType, value }) =>
    `Unexpected token in sub-resource block: ${tokenType} ("${value}"). Sub-resource nodes (table, queue-item, bucket) cannot contain child declarations.`,
  "diagnostic.unexpectedTokenInBlock.generic": ({ tokenType, value }) =>
    `Unexpected token in block: ${tokenType} ("${value}")`,
  "diagnostic.unexpectedTokenInBlock.deployNode": ({ tokenType, value }) =>
    `Unexpected token in deploy node: ${tokenType} ("${value}")`,
  "diagnostic.unexpectedTokenInBlock.named": ({ blockKind, tokenType, value }) =>
    `Unexpected token in ${blockKind} block: ${tokenType} ("${value}")`,
  "diagnostic.expectedBraceOrString.message": ({ got, value }) =>
    `Expected { or string literal but got ${got} ("${value}")`,
  "diagnostic.expectedIdentifier.message": ({ got, value }) =>
    `Expected identifier but got ${got} ("${value}")`,
  "diagnostic.expectedStringAfter.message": ({ property }) =>
    `Expected string literal after "${property}"`,
  "diagnostic.propertyNotForNodeKind.role": `"role" property is only valid for user nodes`,
  "diagnostic.propertyNotForNodeKind.handles": `"handles" property is only valid for client and service nodes`,
  "diagnostic.propertyNotForNodeKind.delivers": `"delivers" property is only valid for service nodes`,
  "diagnostic.propertyNotForNodeKind.operations": `"operations" property is only valid for resource declarations inside a usecase`,
  "diagnostic.infraNotInContext.message": ({ infraKind, parentKind }) =>
    `"${infraKind}" is only valid as a direct child of system, not inside "${parentKind}"`,
  "diagnostic.legendNotTopLevel.message": ({ parentKind }) =>
    `legend blocks are only allowed at the top level of a file, not inside "${parentKind}"`,
  "diagnostic.expectedIdOrString.message": ({ context }) =>
    `Expected identifier or string literal after "${context}"`,
  "diagnostic.expectedNodeId.message": ({ kind }) =>
    `Expected identifier or string literal (id) after "${kind}"`,
  "diagnostic.invalidNodeKind.message": ({ kind }) => `Unexpected logical node kind: "${kind}"`,
  "diagnostic.expectedPropertyValue.message": ({ propName }) =>
    `Expected value for property "${propName}"`,
  "diagnostic.expectedIdAfter.message": ({ property }) =>
    `Expected identifier or string literal after "${property}"`,
  "diagnostic.teamPropertyRemoved.message": `"team" property has been removed; declare ownership with an organization block and "owns"`,
  "diagnostic.linkUrlSchemeNotAllowed.message": ({ url, scheme }) =>
    scheme
      ? `link URL "${url}" uses a disallowed scheme "${scheme}" (allowed: http, https, mailto); the link is ignored`
      : `link URL "${url}" is not an absolute http / https / mailto URL; the link is ignored`,
  "diagnostic.edgeSourceMismatch.message": ({ from, parentId }) =>
    `Edge source "${from}" must match the enclosing block id "${parentId}"`,
  "diagnostic.unassignedResource.message": ({ resourceId }) =>
    `resource "${resourceId}" is not assigned to any database`,
  "diagnostic.clientResourceInvalidKind.message": ({ kind, name }) =>
    `Invalid client resource kind "${kind}" for resource "${name}". Allowed kinds: localStorage, sessionStorage, indexedDB, opfs, file, keychain`,
  "diagnostic.unknownResourceOperation.message": ({ operation, resourceId }) =>
    `Unknown resource operation "${operation}" on "${resourceId}". Recognized verbs: create, read, update, delete`,
  "diagnostic.duplicateResourceOperation.message": ({ operation, resourceId }) =>
    `Duplicate resource operation "${operation}" on "${resourceId}"`,
  "diagnostic.invalidCrudDecoration.message": ({ operation, value, resourceId }) =>
    `Invalid CRUD decoration "${value}" on operation "${operation}" of resource "${resourceId}". Right-hand side must be one of: create, read, update, delete`,
  "diagnostic.emptyCrudDecoration.message": ({ operation, resourceId }) =>
    `Empty CRUD decoration on operation "${operation}" of resource "${resourceId}". Use "${operation}:create,read,update,delete" or drop the colon`,
  "diagnostic.duplicateCrudDecorationTarget.message": ({ operation, value, resourceId }) =>
    `Duplicate CRUD verb "${value}" in decoration of "${operation}" on resource "${resourceId}"`,
  "diagnostic.duplicateOwnerAssignment.message": ({ nodeId, existingTeam }) =>
    `"${nodeId}" is owned by more than one team; "${existingTeam}" is kept as its primary owner`,
  "diagnostic.duplicateTeamId.message": ({ teamId }) => `Duplicate team id "${teamId}"`,
  "diagnostic.nodeIdMultipleLocations.message": ({ nodeId }) =>
    `Node id "${nodeId}" appears in multiple locations; first path is used for navigation`,
  "diagnostic.duplicateNodeIdParent.message": ({ nodeId }) =>
    `Duplicate node id "${nodeId}" under the same parent`,
  "diagnostic.ownsTargetNotFound.message": ({ ownedId }) =>
    `"${ownedId}" referenced in "owns" was not found in the system hierarchy`,
  "diagnostic.duplicateEdgeId.message": ({ authorId }) =>
    `Duplicate edge id "#${authorId}"; edge ids must be unique within a system`,
  "diagnostic.ambiguousEdgeBase.message": ({ fromId, toId, arrow }) =>
    `Multiple edges share the base "${fromId}${arrow}${toId}" with no #<id> to disambiguate; per-edge style selectors will not match any of them`,
  "diagnostic.styleTokenTypeMismatch.message": ({ expected, got, value }) =>
    `Expected ${expected} but got ${got} ("${value}")`,
  "diagnostic.expectedStylePropertyName.message": ({ got }) =>
    `Expected property name but got ${got}`,
  "diagnostic.expectedSemicolonBetweenProperties.message": ({ property }) =>
    `Expected ";" after "${property}" but found ","; properties are separated by semicolons`,
  "diagnostic.styleInvalidEnumValue.message": ({ property, value, allowed }) =>
    `Invalid value for "${property}": "${value}". Allowed: ${allowed.join(", ")}`,
  "diagnostic.styleInvalidHexColor.message": ({ property, value }) =>
    `Invalid hex color for "${property}": "${value}" (expected #RGB / #RGBA / #RRGGBB / #RRGGBBAA)`,
  "diagnostic.styleMissingLengthUnit.message": ({ property, value, allowedUnits }) =>
    `Missing unit for "${property}": "${value}". Expected one of: ${allowedUnits.join(", ")}`,
  "diagnostic.styleInvalidLengthUnit.message": ({ property, value, unit, allowedUnits }) =>
    `Invalid unit "${unit}" for "${property}": "${value}". Allowed: ${allowedUnits.join(", ")}`,
  "diagnostic.styleOutOfRange.message": ({ property, value, min, max }) => {
    const range =
      min !== undefined && max !== undefined
        ? `[${min}, ${max}]`
        : min !== undefined
          ? `>= ${min}`
          : max !== undefined
            ? `<= ${max}`
            : "";
    return `Value ${value} for "${property}" is out of range ${range}`;
  },
  "diagnostic.styleUnknownProperty.message": ({ property }) =>
    `Unknown style property "${property}"`,
  "diagnostic.circularImport.message": ({ filePath }) => `Circular import detected: ${filePath}`,
  "diagnostic.fileNotFound.message": ({ filePath }) => `File not found: ${filePath}`,
  "diagnostic.directoryNotFound.message": ({ dirPath }) => `Directory not found: ${dirPath}`,
  "diagnostic.serviceOutsideSystem.message": ({ serviceId }) =>
    `"${serviceId}" is declared outside any system block — system membership is ambiguous`,
  "diagnostic.duplicateNodeInSystem.message": ({ nodeId, systemId }) =>
    `Duplicate node ID "${nodeId}" in system "${systemId}"`,
  "diagnostic.duplicateNodeInDeploy.message": ({ nodeId, deployId }) =>
    `Duplicate node ID "${nodeId}" in deploy block "${deployId}"`,
  "diagnostic.duplicateTeamInOrganization.message": ({ teamId, orgId }) =>
    `Duplicate team ID "${teamId}" in organization "${orgId}"`,
  "diagnostic.systemPropertyConflict.message": ({
    blockKind,
    blockId,
    property,
    chosen,
    ignored,
  }) => `${blockKind} "${blockId}" ${property} conflict — using "${chosen}", ignoring "${ignored}"`,
  "diagnostic.infraLeafRedeclaredSilently.message": ({ leafKind, leafId, infraKind, infraId }) =>
    `${leafKind} "${leafId}" is declared more than once inside ${infraKind} "${infraId}"; karasu kept the first declaration.`,
  "diagnostic.infraRedeclaredAcrossFiles.message": ({ blockKind, blockId }) =>
    `${blockKind} "${blockId}" is declared in multiple files; karasu merged them.`,
  "diagnostic.importIdNotFound.message": ({ id, path }) =>
    `Imported identifier "${id}" not found in ${path}`,
  "diagnostic.importPathNotFound.message": ({
    path,
    failedAt,
    failedSegment,
    importPath,
    lastResolvedId,
  }) =>
    lastResolvedId
      ? `Import path "${path}" failed at segment "${failedSegment}" (#${failedAt}): no child with that id under "${lastResolvedId}"`
      : `Import path "${path}" failed at segment "${failedSegment}" (#${failedAt}): no top-level system with that id in ${importPath}`,
  "diagnostic.circularStyleImport.message": ({ filePath }) =>
    `Circular style import detected: ${filePath}`,
  "diagnostic.styleFileNotFound.message": ({ filePath }) => `Style file not found: ${filePath}`,
  "diagnostic.appProjectCompileError.message": "An error occurred while compiling the project",
  "diagnostic.appOrgParseError.message": "An error occurred during parsing",
};
