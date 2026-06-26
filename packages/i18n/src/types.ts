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

  // Theme selector
  "theme.label": string;
  "theme.system": string;
  "theme.light": string;
  "theme.dark": string;

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
  "projectInit.error.title": string;
  "projectInit.error.hint": string;
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
  "projectSelector.translate.title": string;
  "projectSelector.translate.button": string;
  "projectSelector.ok": string;
  "projectSelector.cancel": string;
  "project.error.create": (params: { detail: string }) => string;
  "project.error.rename": (params: { detail: string }) => string;
  "project.error.delete": (params: { detail: string }) => string;
  "project.error.export": (params: { detail: string }) => string;
  "project.error.import": (params: { detail: string }) => string;
  "project.error.openExample": (params: { detail: string }) => string;
  "project.error.snapshot": (params: { detail: string }) => string;
  "project.error.dismiss": string;

  // Translate dialog
  "translateDialog.title": string;
  "translateDialog.description": string;
  "translateDialog.format.label": string;
  "translateDialog.format.compose": string;
  "translateDialog.format.k8s": string;
  "translateDialog.format.openapi": string;
  "translateDialog.format.db": string;
  "translateDialog.loadHint": string;
  "translateDialog.loadFile": string;
  "translateDialog.loadFile.aria": string;
  "translateDialog.sourceContent": string;
  "translateDialog.advanced": string;
  "translateDialog.sourceName.label": string;
  "translateDialog.sourceName.aria": string;
  "translateDialog.service.label": string;
  "translateDialog.service.aria": string;
  "translateDialog.database": string;
  "translateDialog.granularity.label": string;
  "translateDialog.granularity.resourceDefault": string;
  "translateDialog.granularity.operation": string;
  "translateDialog.granularity.aggregateDefault": string;
  "translateDialog.granularity.table": string;
  "translateDialog.emitBindings": string;
  "translateDialog.emitCrudDecoration": string;
  "translateDialog.system.label": string;
  "translateDialog.system.aria": string;
  "translateDialog.mapFile.label": string;
  "translateDialog.mapFile.aria": string;
  "translateDialog.result": string;
  "translateDialog.close": string;
  "translateDialog.download": string;
  "translateDialog.copy": string;
  "translateDialog.translate": string;
  "translateDialog.copyFailed": string;
  "translateDialog.loadFailed": string;

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
  "nodeDetail.annotationDiff.title": string;
  "nodeDetail.resources.title": string;
  "nodeDetail.capabilities.title": string;
  "nodeDetail.migration.title": string;
  "nodeDetail.migration.until": string;
  "nodeDetail.migration.from": string;

  // Empty-state placeholders (rendered inside SVG by core renderers)
  "emptyState.deploy.title": string;
  "emptyState.deploy.hint": string;
  "emptyState.deploy.jobBand": string;
  "emptyState.deploy.unclassified": string;
  "emptyState.org.noTeams": string;
  "emptyState.system.noNodes": string;
  "emptyState.org.placeholder": string;
  "emptyState.system.noDiagram": string;

  // Built-in annotation badge labels (rendered inside SVG by core renderers)
  "badge.deprecated": string;
  "badge.new": string;
  "badge.experimental": string;
  "badge.migrationTarget": string;

  // ReferencePanel (Phase C5)
  "referencePanel.unsupportedMessage": string;
  "referencePanel.builtin.description": string;
  "referencePanel.samples.description": string;
  "referencePanel.copy.label": string;
  "referencePanel.copy.copied": string;

  // Preview toolbar — export controls
  "preview.export.svg.label": string;
  "preview.export.svg.ariaLabel": string;
  "preview.export.options.ariaLabel": string;
  "preview.export.drillDown.label": string;
  "preview.export.allDiagrams.label": string;
  "preview.export.drawio.label": string;
  "preview.export.drawio.title": string;
  "preview.export.drawio.failed": (params: { detail: string }) => string;

  // Preview toolbar — Share (inline URL sharing, karasu-nest)
  "preview.share.label": string;
  "preview.share.ariaLabel": string;
  "preview.share.dialog.title": string;
  "preview.share.dialog.description": string;
  "preview.share.dialog.privateLabel": string;
  "preview.share.dialog.privateHint": string;
  "preview.share.dialog.privateUrlAriaLabel": string;
  "preview.share.dialog.unfurlLabel": string;
  "preview.share.dialog.unfurlHint": string;
  "preview.share.dialog.unfurlUrlAriaLabel": string;
  "preview.share.dialog.oversizeWarning": string;
  "preview.share.dialog.generating": string;
  "preview.share.dialog.copy": string;
  "preview.share.dialog.copied": string;
  "preview.share.dialog.close": string;
  "preview.share.restoreFailed": string;

  // Preview toolbar — documentation links dropdown (in-app Reference + docs site)
  "preview.docs.label": string;
  "preview.docs.ariaLabel": string;
  "preview.docs.reference.label": string;
  "preview.docs.site.label": string;
  "preview.docs.site.ariaLabel": string;

  // Warning messages (Phase D.1) — rendered in the WarningPanel.
  // One `message` key per WarningKind, plus optional `details` keys for
  // kinds that carry multi-line or repeated detail rows.
  "warning.domainDispersal.message": (params: { domainId: string }) => string;
  "warning.domainDispersal.checkCohesion": string;
  "warning.sharedInfraFanIn.message": (params: {
    infraKind: string;
    infraId: string;
    count: number;
  }) => string;
  "warning.sharedInfraFanIn.checkDatabasePerService": string;
  "warning.unassignedDomain.message": (params: { display: string }) => string;
  "warning.unassignedUsecase.message": (params: { usecaseId: string }) => string;
  "warning.unassignedService.message": (params: { display: string }) => string;
  "warning.unassignedClient.message": (params: { display: string }) => string;
  "warning.unresolvedHandles.message": (params: {
    nodeKind: "client" | "service";
    nodeId: string;
    domainId: string;
  }) => string;
  "warning.unassignedDatabase.message": (params: { display: string }) => string;
  "warning.unassignedQueue.message": (params: { display: string }) => string;
  "warning.unassignedStorage.message": (params: { display: string }) => string;
  "warning.styleConflict.message": (params: { selector: string }) => string;
  "warning.styleConflict.sheetLabel": (params: { index: number }) => string;
  "warning.missingRuntime.message": (params: { nodeId: string }) => string;
  "warning.missingRealizes.message": (params: { nodeId: string }) => string;
  "warning.unresolvedRealizes.message": (params: {
    deployNodeId: string;
    target: string;
  }) => string;
  "warning.invalidOwns.message": (params: { teamId: string; ownedId: string }) => string;
  "warning.crossSystemRefUnresolved.message": (params: { ref: string }) => string;
  "warning.unresolvedEdgeEndpoint.message": (params: {
    from: string;
    to: string;
    unresolvedId: string;
  }) => string;
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
  "warning.deliversTargetNotClient.message": (params: {
    serviceId: string;
    targetId: string;
  }) => string;
  "warning.clientCapabilityDuplicate.message": (params: {
    clientId: string;
    name: string;
  }) => string;
  "warning.annotationPossibleTypo.message": (params: {
    nodeId: string;
    annotation: string;
    suggestion: string;
  }) => string;
  "warning.annotationPossibleTypo.openSetNote": string;
  "warning.legendRefUnresolved.message": (params: {
    target: string;
    legendTitle?: string;
  }) => string;
  "warning.styleColumnInvalidValue.message": (params: { nodeId: string; value: string }) => string;
  "warning.styleColumnIgnoredNonSystemView.message": (params: {
    nodeId: string;
    viewType: "deploy" | "org";
  }) => string;
  "warning.styleGridColumnsInvalidValue.message": (params: {
    nodeId: string;
    value: string;
  }) => string;
  // Value-level validator (Phase 3)
  "warning.styleInvalidEnumValue.message": (params: {
    property: string;
    value: string;
    allowed: string[];
  }) => string;
  "warning.styleInvalidHexColor.message": (params: { property: string; value: string }) => string;
  "warning.styleMissingLengthUnit.message": (params: {
    property: string;
    value: string;
    allowedUnits: string[];
  }) => string;
  "warning.styleInvalidLengthUnit.message": (params: {
    property: string;
    value: string;
    unit: string;
    allowedUnits: string[];
  }) => string;
  "warning.styleOutOfRange.message": (params: {
    property: string;
    value: number;
    min?: number;
    max?: number;
  }) => string;
  "warning.styleUnknownProperty.message": (params: { property: string }) => string;

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
  "diagnostic.topLevelDeclaration.message": (params: { construct: "user" | "edge" }) => string;
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
  "diagnostic.propertyNotForNodeKind.handles": string;
  "diagnostic.propertyNotForNodeKind.delivers": string;
  "diagnostic.propertyNotForNodeKind.operations": string;
  "diagnostic.infraNotInContext.message": (params: {
    infraKind: string;
    parentKind: string;
  }) => string;
  "diagnostic.legendNotTopLevel.message": (params: { parentKind: string }) => string;
  "diagnostic.expectedIdOrString.message": (params: { context: string }) => string;
  "diagnostic.expectedNodeId.message": (params: { kind: string }) => string;
  "diagnostic.invalidNodeKind.message": (params: { kind: string }) => string;
  "diagnostic.expectedPropertyValue.message": (params: { propName: string }) => string;
  "diagnostic.expectedIdAfter.message": (params: { property: string }) => string;
  "diagnostic.teamPropertyRemoved.message": string;
  "diagnostic.annotationParamUnsupported.message": (params: {
    annotation: string;
    key: string;
  }) => string;
  "diagnostic.linkUrlSchemeNotAllowed.message": (params: { url: string; scheme: string }) => string;
  "diagnostic.edgeSourceMismatch.message": (params: { from: string; parentId: string }) => string;
  "diagnostic.unassignedResource.message": (params: { resourceId: string }) => string;
  "diagnostic.clientResourceInvalidKind.message": (params: {
    kind: string;
    name: string;
  }) => string;
  "diagnostic.unknownResourceOperation.message": (params: {
    operation: string;
    resourceId: string;
  }) => string;
  "diagnostic.duplicateResourceOperation.message": (params: {
    operation: string;
    resourceId: string;
  }) => string;
  "diagnostic.invalidCrudDecoration.message": (params: {
    operation: string;
    value: string;
    resourceId: string;
  }) => string;
  "diagnostic.emptyCrudDecoration.message": (params: {
    operation: string;
    resourceId: string;
  }) => string;
  "diagnostic.duplicateCrudDecorationTarget.message": (params: {
    operation: string;
    value: string;
    resourceId: string;
  }) => string;
  "diagnostic.duplicateOwnerAssignment.message": (params: {
    nodeId: string;
    existingTeam: string;
  }) => string;
  "diagnostic.duplicateTeamId.message": (params: { teamId: string }) => string;
  "diagnostic.nodeIdMultipleLocations.message": (params: { nodeId: string }) => string;
  "diagnostic.duplicateNodeIdParent.message": (params: { nodeId: string }) => string;
  "diagnostic.ownsTargetNotFound.message": (params: { ownedId: string }) => string;
  "diagnostic.duplicateEdgeId.message": (params: { authorId: string }) => string;
  "diagnostic.ambiguousEdgeBase.message": (params: {
    fromId: string;
    toId: string;
    arrow: "->" | "-->";
  }) => string;
  "diagnostic.styleTokenTypeMismatch.message": (params: {
    expected: string;
    got: string;
    value: string;
  }) => string;
  "diagnostic.expectedStylePropertyName.message": (params: { got: string }) => string;
  "diagnostic.expectedSemicolonBetweenProperties.message": (params: { property: string }) => string;
  "diagnostic.unknownEdgeSelectorAttribute.message": (params: { attribute: string }) => string;
  "diagnostic.styleInvalidEnumValue.message": (params: {
    property: string;
    value: string;
    allowed: string[];
  }) => string;
  "diagnostic.styleInvalidHexColor.message": (params: {
    property: string;
    value: string;
  }) => string;
  "diagnostic.styleMissingLengthUnit.message": (params: {
    property: string;
    value: string;
    allowedUnits: string[];
  }) => string;
  "diagnostic.styleInvalidLengthUnit.message": (params: {
    property: string;
    value: string;
    unit: string;
    allowedUnits: string[];
  }) => string;
  "diagnostic.styleOutOfRange.message": (params: {
    property: string;
    value: number;
    min?: number;
    max?: number;
  }) => string;
  "diagnostic.styleUnknownProperty.message": (params: { property: string }) => string;
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
  "diagnostic.systemPropertyConflict.message": (params: {
    blockId: string;
    blockKind: "system" | "deploy" | "organization";
    property: "label" | "description";
    chosen: string;
    ignored: string;
  }) => string;
  "diagnostic.infraRedeclaredAcrossFiles.message": (params: {
    blockId: string;
    blockKind: "database" | "queue" | "storage";
  }) => string;
  "diagnostic.infraLeafRedeclaredSilently.message": (params: {
    leafId: string;
    leafKind: "table" | "queue-item" | "bucket";
    infraId: string;
    infraKind: "database" | "queue" | "storage";
  }) => string;
  "diagnostic.importIdNotFound.message": (params: { id: string; path: string }) => string;
  "diagnostic.importPathNotFound.message": (params: {
    path: string;
    failedAt: number;
    failedSegment: string;
    importPath: string;
    lastResolvedId: string;
  }) => string;
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
