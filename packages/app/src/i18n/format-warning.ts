/**
 * React hook that returns a locale-aware formatter for core `Warning`
 * objects. Replaces the `formatWarning` compat bridge for app consumers
 * (Phase D.1 of the i18n rollout).
 *
 * The compat bridge in `@karasu-tools/core` is kept for CLI / LSP / other
 * non-React consumers that cannot call `useTranslation`.
 */

import { useCallback } from "react";
import type { Warning, FormattedWarning } from "@karasu-tools/core";
import { useTranslation } from "./index.js";

export function useFormattedWarning(): (w: Warning) => FormattedWarning {
  const { t } = useTranslation();

  return useCallback(
    (w: Warning): FormattedWarning => {
      switch (w.kind) {
        case "domain-dispersal":
          return {
            message: t("warning.domainDispersal.message", { domainId: w.params.domainId }),
            details: [...w.params.services, t("warning.domainDispersal.checkCohesion")],
          };
        case "unassigned-domain": {
          const display = w.params.label ?? w.params.domainId;
          return {
            message: t("warning.unassignedDomain.message", { display }),
            details: [],
          };
        }
        case "unassigned-usecase":
          return {
            message: t("warning.unassignedUsecase.message", { usecaseId: w.params.usecaseId }),
            details: [],
          };
        case "unassigned-service": {
          const display = w.params.label ?? w.params.serviceId;
          return {
            message: t("warning.unassignedService.message", { display }),
            details: [],
          };
        }
        case "unassigned-client": {
          const display = w.params.label ?? w.params.clientId;
          return {
            message: t("warning.unassignedClient.message", { display }),
            details: [],
          };
        }
        case "unresolved-handles": {
          return {
            message: t("warning.unresolvedHandles.message", {
              nodeKind: w.params.nodeKind,
              nodeId: w.params.nodeId,
              domainId: w.params.domainId,
            }),
            details: [],
          };
        }
        case "unassigned-database": {
          const display = w.params.label ?? w.params.databaseId;
          return {
            message: t("warning.unassignedDatabase.message", { display }),
            details: [],
          };
        }
        case "unassigned-queue": {
          const display = w.params.label ?? w.params.queueId;
          return {
            message: t("warning.unassignedQueue.message", { display }),
            details: [],
          };
        }
        case "unassigned-storage": {
          const display = w.params.label ?? w.params.storageId;
          return {
            message: t("warning.unassignedStorage.message", { display }),
            details: [],
          };
        }
        case "style-conflict":
          return {
            message: t("warning.styleConflict.message", { selector: w.params.selector }),
            details: w.params.sheetIndices.map((index) =>
              t("warning.styleConflict.sheetLabel", { index }),
            ),
          };
        case "missing-runtime":
          return {
            message: t("warning.missingRuntime.message", { nodeId: w.params.nodeId }),
            details: [],
          };
        case "missing-realizes":
          return {
            message: t("warning.missingRealizes.message", { nodeId: w.params.nodeId }),
            details: [],
          };
        case "invalid-owns":
          return {
            message: t("warning.invalidOwns.message", {
              teamId: w.params.teamId,
              ownedId: w.params.ownedId,
            }),
            details: [],
          };
        case "deprecated-team-property":
          return {
            message: t("warning.deprecatedTeamProperty.message", { nodeId: w.params.nodeId }),
            details: [
              t("warning.deprecatedTeamProperty.assignedBy", {
                ownerTeamId: w.params.ownerTeamId,
              }),
              t("warning.deprecatedTeamProperty.recommendation"),
            ],
          };
        case "cross-system-ref-unresolved":
          return {
            message: t("warning.crossSystemRefUnresolved.message", { ref: w.params.ref }),
            details: [],
          };
        case "cross-system-ref-implicit-external":
          return {
            message: t("warning.crossSystemRefImplicitExternal.message", {
              ref: w.params.ref,
              sourceSystemId: w.params.sourceSystemId,
              sourceNodeId: w.params.sourceNodeId,
            }),
            details: [
              t("warning.crossSystemRefImplicitExternal.suppressHint", {
                targetSystemId: w.params.targetSystemId,
                sourceSystemId: w.params.sourceSystemId,
              }),
            ],
          };
        case "delivers-target-not-client":
          return {
            message: t("warning.deliversTargetNotClient.message", {
              serviceId: w.params.serviceId,
              targetId: w.params.targetId,
            }),
            details: [],
          };
        case "cyclic-dependency": {
          const { cyclePath } = w.params;
          const path =
            cyclePath.length === 2 && cyclePath[0] === cyclePath[1]
              ? `${cyclePath[0]} → ${cyclePath[0]}`
              : cyclePath.join(" → ");
          return {
            message: t("warning.cyclicDependency.message", { path }),
            details: [],
          };
        }
      }
      // `w` is typed as `never` here if the switch is exhaustive; the
      // throw makes TypeScript's control-flow analysis happy and guards
      // against new WarningKind values being added to core without a
      // corresponding case here.
      const exhaustiveCheck: never = w;
      throw new Error(`Unhandled warning kind: ${JSON.stringify(exhaustiveCheck)}`);
    },
    [t],
  );
}
