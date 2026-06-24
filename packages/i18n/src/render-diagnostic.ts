/**
 * Locale-neutral rendering of a core `Diagnostic` into a display string.
 *
 * `renderDiagnostic(d, t)` is a pure function: it takes a translator `t`
 * and produces the user-facing message. The app binds `t` to its React
 * `useTranslation()` hook; the lsp / cli bind it to `translate()` with an
 * environment-resolved locale.
 */

import type { Diagnostic } from "@karasu-tools/core";
import type { TranslateFn } from "./render-warning.js";

/**
 * Render a `Diagnostic` to a display string using the supplied translator.
 * The switch is exhaustive over `DiagnosticCode`; the `never` check at the
 * end guards against new codes added to core without a case here.
 */
export function renderDiagnostic(d: Diagnostic, t: TranslateFn): string {
  switch (d.code) {
    case "token-type-mismatch":
      return t("diagnostic.tokenTypeMismatch.message", d.params);
    case "unexpected-token-root":
      return t("diagnostic.unexpectedTokenRoot.message", d.params);
    case "top-level-declaration":
      return t("diagnostic.topLevelDeclaration.message", d.params);
    case "unexpected-token-in-block": {
      const { blockKind, tokenType, value } = d.params;
      if (blockKind === "sub-resource") {
        return t("diagnostic.unexpectedTokenInBlock.subResource", { tokenType, value });
      }
      if (blockKind === "") {
        return t("diagnostic.unexpectedTokenInBlock.generic", { tokenType, value });
      }
      if (blockKind === "deploy node") {
        return t("diagnostic.unexpectedTokenInBlock.deployNode", { tokenType, value });
      }
      return t("diagnostic.unexpectedTokenInBlock.named", { blockKind, tokenType, value });
    }
    case "expected-brace-or-string":
      return t("diagnostic.expectedBraceOrString.message", d.params);
    case "expected-identifier":
      return t("diagnostic.expectedIdentifier.message", d.params);
    case "expected-string-after":
      return t("diagnostic.expectedStringAfter.message", d.params);
    case "property-not-for-node-kind":
      switch (d.params.property) {
        case "role":
          return t("diagnostic.propertyNotForNodeKind.role");
        case "handles":
          return t("diagnostic.propertyNotForNodeKind.handles");
        case "delivers":
          return t("diagnostic.propertyNotForNodeKind.delivers");
        case "operations":
          return t("diagnostic.propertyNotForNodeKind.operations");
        default: {
          const exhaustive: never = d.params.property;
          throw new Error(`unhandled property-not-for-node-kind variant: ${String(exhaustive)}`);
        }
      }
    case "infra-not-in-context":
      return t("diagnostic.infraNotInContext.message", d.params);
    case "legend-not-top-level":
      return t("diagnostic.legendNotTopLevel.message", d.params);
    case "expected-id-or-string":
      return t("diagnostic.expectedIdOrString.message", d.params);
    case "expected-node-id":
      return t("diagnostic.expectedNodeId.message", d.params);
    case "invalid-node-kind":
      return t("diagnostic.invalidNodeKind.message", d.params);
    case "expected-property-value":
      return t("diagnostic.expectedPropertyValue.message", d.params);
    case "expected-id-after":
      return t("diagnostic.expectedIdAfter.message", d.params);
    case "team-property-removed":
      return t("diagnostic.teamPropertyRemoved.message");
    case "annotation-param-unsupported":
      return t("diagnostic.annotationParamUnsupported.message", d.params);
    case "link-url-scheme-not-allowed":
      return t("diagnostic.linkUrlSchemeNotAllowed.message", d.params);
    case "edge-source-mismatch":
      return t("diagnostic.edgeSourceMismatch.message", d.params);
    case "unassigned-resource":
      return t("diagnostic.unassignedResource.message", d.params);
    case "client-resource-invalid-kind":
      return t("diagnostic.clientResourceInvalidKind.message", d.params);
    case "unknown-resource-operation":
      return t("diagnostic.unknownResourceOperation.message", d.params);
    case "duplicate-resource-operation":
      return t("diagnostic.duplicateResourceOperation.message", d.params);
    case "invalid-crud-decoration":
      return t("diagnostic.invalidCrudDecoration.message", d.params);
    case "empty-crud-decoration":
      return t("diagnostic.emptyCrudDecoration.message", d.params);
    case "duplicate-crud-decoration-target":
      return t("diagnostic.duplicateCrudDecorationTarget.message", d.params);
    case "duplicate-owner-assignment":
      return t("diagnostic.duplicateOwnerAssignment.message", d.params);
    case "duplicate-team-id":
      return t("diagnostic.duplicateTeamId.message", d.params);
    case "node-id-multiple-locations":
      return t("diagnostic.nodeIdMultipleLocations.message", d.params);
    case "duplicate-node-id-parent":
      return t("diagnostic.duplicateNodeIdParent.message", d.params);
    case "owns-target-not-found":
      return t("diagnostic.ownsTargetNotFound.message", d.params);
    case "duplicate-edge-id":
      return t("diagnostic.duplicateEdgeId.message", d.params);
    case "ambiguous-edge-base":
      return t("diagnostic.ambiguousEdgeBase.message", d.params);
    case "style-token-type-mismatch":
      return t("diagnostic.styleTokenTypeMismatch.message", d.params);
    case "expected-style-property-name":
      return t("diagnostic.expectedStylePropertyName.message", d.params);
    case "expected-semicolon-between-properties":
      return t("diagnostic.expectedSemicolonBetweenProperties.message", d.params);
    case "unknown-edge-selector-attribute":
      return t("diagnostic.unknownEdgeSelectorAttribute.message", d.params);
    case "style-invalid-enum-value":
      return t("diagnostic.styleInvalidEnumValue.message", d.params);
    case "style-invalid-hex-color":
      return t("diagnostic.styleInvalidHexColor.message", d.params);
    case "style-missing-length-unit":
      return t("diagnostic.styleMissingLengthUnit.message", d.params);
    case "style-invalid-length-unit":
      return t("diagnostic.styleInvalidLengthUnit.message", d.params);
    case "style-out-of-range":
      return t("diagnostic.styleOutOfRange.message", d.params);
    case "style-unknown-property":
      return t("diagnostic.styleUnknownProperty.message", d.params);
    case "circular-import":
      return t("diagnostic.circularImport.message", d.params);
    case "file-not-found":
      return t("diagnostic.fileNotFound.message", d.params);
    case "directory-not-found":
      return t("diagnostic.directoryNotFound.message", d.params);
    case "service-outside-system":
      return t("diagnostic.serviceOutsideSystem.message", d.params);
    case "duplicate-node-in-system":
      return t("diagnostic.duplicateNodeInSystem.message", d.params);
    case "duplicate-node-in-deploy":
      return t("diagnostic.duplicateNodeInDeploy.message", d.params);
    case "duplicate-team-in-organization":
      return t("diagnostic.duplicateTeamInOrganization.message", d.params);
    case "system-property-conflict":
      return t("diagnostic.systemPropertyConflict.message", d.params);
    case "infra-redeclared-across-files":
      return t("diagnostic.infraRedeclaredAcrossFiles.message", d.params);
    case "infra-leaf-redeclared-silently":
      return t("diagnostic.infraLeafRedeclaredSilently.message", d.params);
    case "import-id-not-found":
      return t("diagnostic.importIdNotFound.message", d.params);
    case "import-path-not-found":
      return t("diagnostic.importPathNotFound.message", {
        path: d.params.path.join("."),
        failedAt: d.params.failedAt,
        failedSegment: d.params.path[d.params.failedAt] ?? "",
        importPath: d.params.importPath,
        lastResolvedId: d.params.lastResolvedId ?? "",
      });
    case "circular-style-import":
      return t("diagnostic.circularStyleImport.message", d.params);
    case "style-file-not-found":
      return t("diagnostic.styleFileNotFound.message", d.params);
    case "app-project-compile-error":
      return t("diagnostic.appProjectCompileError.message");
    case "app-org-parse-error":
      return t("diagnostic.appOrgParseError.message");
    case "generic-text":
      return d.params.text;
  }
  const exhaustiveCheck: never = d;
  throw new Error(`Unhandled diagnostic code: ${JSON.stringify(exhaustiveCheck)}`);
}
