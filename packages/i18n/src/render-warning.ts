/**
 * Locale-neutral rendering of a core `Warning` into a `FormattedWarning`.
 *
 * `renderWarning(w, t)` is a pure function: it takes a translator `t` and
 * produces the user-facing `message` / `details`. The app binds `t` to its
 * React `useTranslation()` hook; the lsp / cli bind it to `translate()`
 * with an environment-resolved locale.
 */

import type { Warning, FormattedWarning } from "@karasu-tools/core";
import type { TranslateFn } from "./translate.js";

/**
 * Render a `Warning` to a `FormattedWarning` using the supplied translator.
 * The `Record<WarningKind, ...>` exhaustiveness of the switch is enforced
 * by the `never` check at the end.
 */
export function renderWarning(w: Warning, t: TranslateFn): FormattedWarning {
  switch (w.kind) {
    case "domain-dispersal":
      return {
        message: t("warning.domainDispersal.message", { domainId: w.params.domainId }),
        details: [...w.params.services, t("warning.domainDispersal.checkCohesion")],
      };
    case "shared-infra-fan-in":
      return {
        message: t("warning.sharedInfraFanIn.message", {
          infraKind: w.params.infraKind,
          infraId: w.params.infraId,
          count: w.params.services.length,
        }),
        details: [...w.params.services, t("warning.sharedInfraFanIn.checkDatabasePerService")],
      };
    case "cross-domain-store-access":
      return {
        message: t("warning.crossDomainStoreAccess.message", {
          accessingDomain: w.params.accessingDomain,
          infraKind: w.params.infraKind,
          infraId: w.params.infraId,
          tableId: w.params.tableId,
          mode: w.params.mode,
          ownerCount: w.params.owningDomains.length,
        }),
        details: [...w.params.owningDomains, t("warning.crossDomainStoreAccess.checkBoundary")],
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
    case "unassigned-resource":
      return {
        message: t("warning.unassignedResource.message", { resourceId: w.params.resourceId }),
        details: [],
      };
    case "entity-anchor-collision":
      return {
        message: t("warning.entityAnchorCollision.message", { id: w.params.id }),
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
    case "unresolved-realizes":
      return {
        message: t("warning.unresolvedRealizes.message", {
          deployNodeId: w.params.deployNodeId,
          target: w.params.target,
        }),
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
    case "cross-system-ref-unresolved":
      return {
        message: t("warning.crossSystemRefUnresolved.message", { ref: w.params.ref }),
        details: [],
      };
    case "unresolved-edge-endpoint":
      return {
        message: t("warning.unresolvedEdgeEndpoint.message", {
          from: w.params.from,
          to: w.params.to,
          unresolvedId: w.params.unresolvedId,
        }),
        details: [],
      };
    case "edge-endpoint-not-at-scope": {
      const { ownerId, endpointId, scopeKind, from, to } = w.params;
      // A relation authored inside an `entity` block is fixed by qualifying the
      // target (`Domain.Entity`), not by re-anchoring it — the source is already
      // the declaring entity. Every other scope is fixed by anchoring the edge
      // at its source block.
      const hint =
        scopeKind === "entity" && ownerId !== undefined
          ? t("warning.edgeEndpointNotAtScope.qualifyHint", { ownerId, endpointId })
          : t("warning.edgeEndpointNotAtScope.anchorHint", { from, to });
      return {
        message: t("warning.edgeEndpointNotAtScope.message", {
          from,
          to,
          endpointId,
          endpointKind: w.params.endpointKind,
          ownerId: ownerId ?? "",
          ownerKind: w.params.ownerKind ?? "",
          scopeId: w.params.scopeId,
          scopeKind,
        }),
        details: [hint],
      };
    }
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
    case "client-capability-duplicate":
      return {
        message: t("warning.clientCapabilityDuplicate.message", {
          clientId: w.params.clientId,
          name: w.params.name,
        }),
        details: [],
      };
    case "annotation-possible-typo":
      return {
        message: t("warning.annotationPossibleTypo.message", {
          nodeId: w.params.nodeId,
          annotation: w.params.annotation,
          suggestion: w.params.suggestion,
        }),
        details: [t("warning.annotationPossibleTypo.openSetNote")],
      };
    case "tag-not-builtin":
      return {
        message: t("warning.tagNotBuiltin.message", {
          nodeId: w.params.nodeId,
          tag: w.params.tag,
        }),
        details: [t("warning.tagNotBuiltin.migrationNote")],
      };
    case "annotation-not-builtin":
      return {
        message: t("warning.annotationNotBuiltin.message", {
          nodeId: w.params.nodeId,
          annotation: w.params.annotation,
        }),
        details: [t("warning.annotationNotBuiltin.migrationNote")],
      };
    case "legend-ref-unresolved":
      return {
        message: t("warning.legendRefUnresolved.message", {
          target: w.params.target,
          legendTitle: w.params.legendTitle,
        }),
        details: [],
      };
    case "style-column-invalid-value":
      return {
        message: t("warning.styleColumnInvalidValue.message", {
          nodeId: w.params.nodeId,
          value: w.params.value,
        }),
        details: [],
      };
    case "style-column-ignored-non-system-view":
      return {
        message: t("warning.styleColumnIgnoredNonSystemView.message", {
          nodeId: w.params.nodeId,
          viewType: w.params.viewType,
        }),
        details: [],
      };
    case "style-grid-columns-invalid-value":
      return {
        message: t("warning.styleGridColumnsInvalidValue.message", {
          nodeId: w.params.nodeId,
          value: w.params.value,
        }),
        details: [],
      };
    case "style-invalid-enum-value":
      return {
        message: t("warning.styleInvalidEnumValue.message", w.params),
        details: [],
      };
    case "style-invalid-hex-color":
      return {
        message: t("warning.styleInvalidHexColor.message", w.params),
        details: [],
      };
    case "style-missing-length-unit":
      return {
        message: t("warning.styleMissingLengthUnit.message", w.params),
        details: [],
      };
    case "style-invalid-length-unit":
      return {
        message: t("warning.styleInvalidLengthUnit.message", w.params),
        details: [],
      };
    case "style-out-of-range":
      return {
        message: t("warning.styleOutOfRange.message", w.params),
        details: [],
      };
    case "style-unknown-property":
      return {
        message: t("warning.styleUnknownProperty.message", w.params),
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
}
