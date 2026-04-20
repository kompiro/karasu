/**
 * Translations — the single source of truth for all translatable strings
 * in the karasu app.
 *
 * Each key maps to one of:
 *   - `string`                              : a static phrase (no interpolation)
 *   - `(params: {...}) => string`           : a phrase with typed interpolation
 *
 * Per `docs/design/i18n-support.md`, the locale files (`en.ts`, `ja.ts`)
 * implement this map. The `en.ts` file must be complete (this is what the
 * TypeScript type enforces). The `ja.ts` file may be partial; any key
 * missing in `ja.ts` falls through to the English value at render time.
 *
 * Keys are added incrementally as each app subsystem is translated in the
 * rollout phases documented in `docs/design/i18n-support.md`.
 * Phase A (this file's initial version) seeds the map with the strings
 * needed by the language selector itself, so Phase C1 (toolbar + selector)
 * can consume them immediately.
 */

export type Translations = {
  "languageSelector.label": string;
  "languageSelector.english": string;
  "languageSelector.japanese": string;

  // Settings pane (Phase C2)
  "settings.ai.title": string;
  "settings.security.heading": string;
  "settings.security.bodyBrowser": string;
  "settings.security.bodyXss": string;
  "settings.security.linkLabel": string;
  "settings.apiKey.label": string;
  "settings.persist.label": string;
  "settings.persist.hint": string;
  "settings.save.saved": string;
  "settings.save.label": string;
  "settings.clear.label": string;

  // Project selector (Phase C3)
  "projectSelector.namePlaceholder": string;
  "projectSelector.new.title": string;
  "projectSelector.new.button": string;
  "projectSelector.rename.title": string;
  "projectSelector.rename.button": string;
  "projectSelector.delete.title": string;
  "projectSelector.delete.button": string;
  "projectSelector.delete.confirm": (params: { name: string }) => string;
  "projectSelector.export.title": string;
  "projectSelector.export.button": string;
  "projectSelector.import.title": string;
  "projectSelector.import.button": string;
  "projectSelector.ok": string;
  "projectSelector.cancel": string;

  // Chat pane (Phase C4)
  "chat.newSession.button": string;
  "chat.startInterview.button": string;
  "chat.startReview.button": string;
  "chat.emptyState.hint": string;
  "chat.message.userRole": string;
  "chat.retry.button": string;
  "chat.openSettings.button": string;
  "chat.loading": string;
  "chat.input.placeholderPending": string;
  "chat.input.placeholderDefault": string;
  "chat.input.ariaLabel": string;
  "chat.send.button": string;
  "chat.patch.apply.button": string;
  "chat.patch.reject.button": string;
  "chat.apiKeySetup.message": string;
  "chat.apiKeySetup.goToSettings": string;

  // Chat error messages (Phase C5/C6) — surfaced in the chat log when an
  // Anthropic API call or patch application fails
  "chat.error.auth": string;
  "chat.error.rateLimit": string;
  "chat.error.server": string;
  "chat.error.patchFailed": (params: { detail: string }) => string;

  // NodeDetailPanel (Phase C5)
  "nodeDetail.close": string;
  "nodeDetail.links.title": string;
  "nodeDetail.openDeployView": string;
  "nodeDetail.jumpToEditor": string;

  // DiagramTabBar (Phase C5)
  "diagramTabBar.deploy.unavailableTitle": string;

  // ReferencePanel (Phase C5)
  "referencePanel.unsupportedMessage": string;

  // Warning messages (Phase D.1) — rendered in the WarningPanel.
  // One `message` key per WarningKind, plus optional `details` keys for
  // kinds that carry multi-line or repeated detail rows.
  "warning.domainDispersal.message": (params: { domainId: string }) => string;
  "warning.domainDispersal.checkCohesion": string;
  "warning.unassignedDomain.message": (params: { display: string }) => string;
  "warning.unassignedUsecase.message": (params: { usecaseId: string }) => string;
  "warning.unassignedService.message": (params: { display: string }) => string;
  "warning.unassignedDatabase.message": (params: { display: string }) => string;
  "warning.unassignedQueue.message": (params: { display: string }) => string;
  "warning.unassignedStorage.message": (params: { display: string }) => string;
  "warning.styleConflict.message": (params: { selector: string }) => string;
  "warning.styleConflict.sheetLabel": (params: { index: number }) => string;
  "warning.missingRuntime.message": (params: { nodeId: string }) => string;
  "warning.missingRealizes.message": (params: { nodeId: string }) => string;
  "warning.invalidOwns.message": (params: { teamId: string; ownedId: string }) => string;
  "warning.deprecatedTeamProperty.message": (params: { nodeId: string }) => string;
  "warning.deprecatedTeamProperty.assignedBy": (params: { ownerTeamId: string }) => string;
  "warning.deprecatedTeamProperty.recommendation": string;
  "warning.crossSystemRefUnresolved.message": (params: { ref: string }) => string;
  "warning.crossSystemRefImplicitExternal.message": (params: {
    ref: string;
    sourceSystemId: string;
    sourceNodeId: string;
  }) => string;
  "warning.crossSystemRefImplicitExternal.suppressHint": (params: {
    targetSystemId: string;
    sourceSystemId: string;
  }) => string;
  "warning.cyclicDependency.message": (params: { path: string }) => string;

  // Diagnostic messages (Phase D.2) — rendered in PreviewPane's diagnostic
  // banner. One entry per DiagnosticCode; codes with branching messages
  // (unexpected-token-in-block, property-not-for-node-kind) split into
  // sub-keys that the hook selects based on params. The `generic-text`
  // code is a passthrough and has no key.
  "diagnostic.tokenTypeMismatch.message": (params: {
    expected: string;
    got: string;
    value: string;
  }) => string;
  "diagnostic.unexpectedTokenRoot.message": (params: {
    tokenType: string;
    value: string;
  }) => string;
  "diagnostic.unexpectedTokenInBlock.subResource": (params: {
    tokenType: string;
    value: string;
  }) => string;
  "diagnostic.unexpectedTokenInBlock.generic": (params: {
    tokenType: string;
    value: string;
  }) => string;
  "diagnostic.unexpectedTokenInBlock.deployNode": (params: {
    tokenType: string;
    value: string;
  }) => string;
  "diagnostic.unexpectedTokenInBlock.named": (params: {
    blockKind: string;
    tokenType: string;
    value: string;
  }) => string;
  "diagnostic.expectedBraceOrString.message": (params: { got: string; value: string }) => string;
  "diagnostic.expectedIdentifier.message": (params: { got: string; value: string }) => string;
  "diagnostic.expectedStringAfter.message": (params: { property: string }) => string;
  "diagnostic.propertyNotForNodeKind.role": string;
  "diagnostic.propertyNotForNodeKind.team": string;
  "diagnostic.infraNotInContext.message": (params: {
    infraKind: string;
    parentKind: string;
  }) => string;
  "diagnostic.expectedIdOrString.message": (params: { context: string }) => string;
  "diagnostic.expectedNodeId.message": (params: { kind: string }) => string;
  "diagnostic.invalidNodeKind.message": (params: { kind: string }) => string;
  "diagnostic.expectedPropertyValue.message": (params: { propName: string }) => string;
  "diagnostic.expectedIdAfter.message": (params: { property: string }) => string;
  "diagnostic.teamPropertyDeprecated.message": string;
  "diagnostic.edgeSourceMismatch.message": (params: { from: string; parentId: string }) => string;
  "diagnostic.unassignedResource.message": (params: { resourceId: string }) => string;
  "diagnostic.duplicateOwnerAssignment.message": (params: {
    nodeId: string;
    existingTeam: string;
  }) => string;
  "diagnostic.duplicateTeamId.message": (params: { teamId: string }) => string;
  "diagnostic.domainIdNotUnique.message": (params: { domainId: string }) => string;
  "diagnostic.nodeIdMultipleLocations.message": (params: { nodeId: string }) => string;
  "diagnostic.duplicateNodeIdParent.message": (params: { nodeId: string }) => string;
  "diagnostic.ownsTargetNotFound.message": (params: { ownedId: string }) => string;
  "diagnostic.styleTokenTypeMismatch.message": (params: {
    expected: string;
    got: string;
    value: string;
  }) => string;
  "diagnostic.expectedStylePropertyName.message": (params: { got: string }) => string;
  "diagnostic.circularImport.message": (params: { filePath: string }) => string;
  "diagnostic.fileNotFound.message": (params: { filePath: string }) => string;
  "diagnostic.directoryNotFound.message": (params: { dirPath: string }) => string;
  "diagnostic.serviceOutsideSystem.message": (params: { serviceId: string }) => string;
  "diagnostic.duplicateNodeInSystem.message": (params: {
    nodeId: string;
    systemId: string;
  }) => string;
  "diagnostic.duplicateNodeInDeploy.message": (params: {
    nodeId: string;
    deployId: string;
  }) => string;
  "diagnostic.duplicateTeamInOrganization.message": (params: {
    teamId: string;
    orgId: string;
  }) => string;
  "diagnostic.importIdNotFound.message": (params: { id: string; path: string }) => string;
  "diagnostic.circularStyleImport.message": (params: { filePath: string }) => string;
  "diagnostic.styleFileNotFound.message": (params: { filePath: string }) => string;
  "diagnostic.appProjectCompileError.message": string;
  "diagnostic.appOrgParseError.message": string;
};

/**
 * Params accepted by a translation key, inferred from the value type.
 * `never` for string-valued keys (they take no params).
 */
export type TranslationParams<K extends keyof Translations> = Translations[K] extends (
  params: infer P,
) => string
  ? P
  : never;
