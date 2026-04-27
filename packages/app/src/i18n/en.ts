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
  "settings.persist.hint": "When off, the API key is cleared when the tab closes (recommended).",
  "settings.save.saved": "✓ Saved",
  "settings.save.label": "💾 Save",
  "settings.clear.label": "🗑 Clear",

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
  "projectSelector.ok": "OK",
  "projectSelector.cancel": "Cancel",

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

  // Empty-state placeholders (rendered inside SVG by core renderers)
  "emptyState.deploy.title": "No deploy block defined",
  "emptyState.deploy.hint": "Add a deploy block to your .krs file",
  "emptyState.org.noTeams": "No teams defined",
  "emptyState.system.noNodes": "No nodes to render",
  "emptyState.org.placeholder": "No org diagram",

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
    `Domain "${domainId}" is dispersed across multiple services`,
  "warning.domainDispersal.checkCohesion": "Review the domain's cohesion",
  "warning.unassignedDomain.message": ({ display }) =>
    `Domain "${display}" is not assigned to any service`,
  "warning.unassignedUsecase.message": ({ usecaseId }) =>
    `Usecase "${usecaseId}" is not assigned to any domain`,
  "warning.unassignedService.message": ({ display }) =>
    `Service "${display}" is not assigned to any system`,
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
  "warning.invalidOwns.message": ({ teamId, ownedId }) =>
    `Team "${teamId}" owns "${ownedId}" but no service or domain with that id exists`,
  "warning.deprecatedTeamProperty.message": ({ nodeId }) =>
    `"${nodeId}" has an explicit team property but team is already assigned via org.team.owns`,
  "warning.deprecatedTeamProperty.assignedBy": ({ ownerTeamId }) =>
    `Team assigned by owns: "${ownerTeamId}"`,
  "warning.deprecatedTeamProperty.recommendation":
    'Remove the "team" property and use org { team { owns } } instead',
  "warning.crossSystemRefUnresolved.message": ({ ref }) =>
    `"${ref}" could not be resolved — rendered as an unresolved external node`,
  "warning.crossSystemRefImplicitExternal.message": ({ ref, sourceSystemId, sourceNodeId }) =>
    `"${ref}" is referenced from ${sourceSystemId}.${sourceNodeId} but is not explicitly annotated as @external`,
  "warning.crossSystemRefImplicitExternal.suppressHint": ({ targetSystemId, sourceSystemId }) =>
    `Add 'service ${targetSystemId} [external]' to system ${sourceSystemId} to suppress this warning`,
  "warning.cyclicDependency.message": ({ path }) => `Circular dependency detected: ${path}`,

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
  "diagnostic.propertyNotForNodeKind.team": `"team" property is only valid for service and domain nodes`,
  "diagnostic.infraNotInContext.message": ({ infraKind, parentKind }) =>
    `"${infraKind}" is only valid as a direct child of system, not inside "${parentKind}"`,
  "diagnostic.expectedIdOrString.message": ({ context }) =>
    `Expected identifier or string literal after "${context}"`,
  "diagnostic.expectedNodeId.message": ({ kind }) =>
    `Expected identifier or string literal (id) after "${kind}"`,
  "diagnostic.invalidNodeKind.message": ({ kind }) => `Unexpected logical node kind: "${kind}"`,
  "diagnostic.expectedPropertyValue.message": ({ propName }) =>
    `Expected value for property "${propName}"`,
  "diagnostic.expectedIdAfter.message": ({ property }) =>
    `Expected identifier or string literal after "${property}"`,
  "diagnostic.teamPropertyDeprecated.message": `"team" property is deprecated; use an organization block with "owns" instead`,
  "diagnostic.edgeSourceMismatch.message": ({ from, parentId }) =>
    `Edge source "${from}" must match the enclosing block id "${parentId}"`,
  "diagnostic.unassignedResource.message": ({ resourceId }) =>
    `resource "${resourceId}" is not assigned to any database`,
  "diagnostic.duplicateOwnerAssignment.message": ({ nodeId, existingTeam }) =>
    `"${nodeId}" is already owned by team "${existingTeam}"; multiple teams cannot own the same service or domain`,
  "diagnostic.duplicateTeamId.message": ({ teamId }) => `Duplicate team id "${teamId}"`,
  "diagnostic.domainIdNotUnique.message": ({ domainId }) =>
    `Domain id "${domainId}" must be unique within a system; found in multiple services`,
  "diagnostic.nodeIdMultipleLocations.message": ({ nodeId }) =>
    `Node id "${nodeId}" appears in multiple locations; first path is used for navigation`,
  "diagnostic.duplicateNodeIdParent.message": ({ nodeId }) =>
    `Duplicate node id "${nodeId}" under the same parent`,
  "diagnostic.ownsTargetNotFound.message": ({ ownedId }) =>
    `"${ownedId}" referenced in "owns" was not found in the system hierarchy`,
  "diagnostic.styleTokenTypeMismatch.message": ({ expected, got, value }) =>
    `Expected ${expected} but got ${got} ("${value}")`,
  "diagnostic.expectedStylePropertyName.message": ({ got }) =>
    `Expected property name but got ${got}`,
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
  "diagnostic.importIdNotFound.message": ({ id, path }) =>
    `Imported identifier "${id}" not found in ${path}`,
  "diagnostic.circularStyleImport.message": ({ filePath }) =>
    `Circular style import detected: ${filePath}`,
  "diagnostic.styleFileNotFound.message": ({ filePath }) => `Style file not found: ${filePath}`,
  "diagnostic.appProjectCompileError.message": "An error occurred while compiling the project",
  "diagnostic.appOrgParseError.message": "An error occurred during parsing",
};
