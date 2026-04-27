/**
 * React hook that returns a locale-aware formatter for core `Diagnostic`
 * objects. Replaces the `formatDiagnostic` compat bridge for app consumers
 * (Phase D.2 of the i18n rollout).
 *
 * The compat bridge in `@karasu-tools/core` is kept for CLI / LSP / other
 * non-React consumers that cannot call `useTranslation`.
 */

import { useCallback } from "react";
import type { Diagnostic } from "@karasu-tools/core";
import { useTranslation } from "./index.js";

export function useFormattedDiagnostic(): (d: Diagnostic) => string {
  const { t } = useTranslation();

  return useCallback(
    (d: Diagnostic): string => {
      switch (d.code) {
        case "token-type-mismatch":
          return t("diagnostic.tokenTypeMismatch.message", d.params);
        case "unexpected-token-root":
          return t("diagnostic.unexpectedTokenRoot.message", d.params);
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
            case "team":
              return t("diagnostic.propertyNotForNodeKind.team");
            case "handles":
              return t("diagnostic.propertyNotForNodeKind.handles");
            case "delivers":
              return t("diagnostic.propertyNotForNodeKind.delivers");
            default: {
              const exhaustive: never = d.params.property;
              throw new Error(
                `unhandled property-not-for-node-kind variant: ${String(exhaustive)}`,
              );
            }
          }
        case "infra-not-in-context":
          return t("diagnostic.infraNotInContext.message", d.params);
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
        case "team-property-deprecated":
          return t("diagnostic.teamPropertyDeprecated.message");
        case "edge-source-mismatch":
          return t("diagnostic.edgeSourceMismatch.message", d.params);
        case "unassigned-resource":
          return t("diagnostic.unassignedResource.message", d.params);
        case "duplicate-owner-assignment":
          return t("diagnostic.duplicateOwnerAssignment.message", d.params);
        case "duplicate-team-id":
          return t("diagnostic.duplicateTeamId.message", d.params);
        case "domain-id-not-unique":
          return t("diagnostic.domainIdNotUnique.message", d.params);
        case "node-id-multiple-locations":
          return t("diagnostic.nodeIdMultipleLocations.message", d.params);
        case "duplicate-node-id-parent":
          return t("diagnostic.duplicateNodeIdParent.message", d.params);
        case "owns-target-not-found":
          return t("diagnostic.ownsTargetNotFound.message", d.params);
        case "style-token-type-mismatch":
          return t("diagnostic.styleTokenTypeMismatch.message", d.params);
        case "expected-style-property-name":
          return t("diagnostic.expectedStylePropertyName.message", d.params);
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
        case "import-id-not-found":
          return t("diagnostic.importIdNotFound.message", d.params);
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
    },
    [t],
  );
}
