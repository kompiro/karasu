/**
 * Temporary compat bridge: reproduces the pre-Phase-B `message` / `details`
 * strings from a structured `Warning`. Exists so app / CLI consumers don't
 * regress during the i18n rollout (see `docs/design/i18n-support.md`
 * Phase B → Phase D).
 *
 * Each branch intentionally outputs the same string that the producer used
 * to write inline. Once the app wires warnings into `useTranslation`
 * (Phase D), this file can be deleted.
 *
 * @deprecated Replaced by `useTranslation()` in Phase D. Do not add new
 *   callers — new UIs should read `w.kind` / `w.params` directly.
 */

import type { Warning } from "../types/warnings.js";

export interface FormattedWarning {
  message: string;
  details: string[];
}

export function formatWarning(w: Warning): FormattedWarning {
  switch (w.kind) {
    case "domain-dispersal":
      return {
        message: `domain "${w.params.domainId}" が複数の service に分散しています`,
        details: [...w.params.services, "ドメインの凝集性を確認してください"],
      };
    case "unassigned-domain": {
      const display = w.params.label ?? w.params.domainId;
      return {
        message: `domain "${display}" is not assigned to any service`,
        details: [],
      };
    }
    case "unassigned-service": {
      const display = w.params.label ?? w.params.serviceId;
      return {
        message: `service "${display}" is not assigned to any system`,
        details: [],
      };
    }
    case "unassigned-client": {
      const display = w.params.label ?? w.params.clientId;
      return {
        message: `client "${display}" is not assigned to any system`,
        details: [],
      };
    }
    case "unresolved-handles": {
      const { nodeKind, nodeId, domainId } = w.params;
      return {
        message: `${nodeKind} "${nodeId}" handles "${domainId}" but no outgoing edge target exposes that domain`,
        details: [],
      };
    }
    case "unassigned-database": {
      const display = w.params.label ?? w.params.databaseId;
      return {
        message: `database "${display}" is not assigned to any system`,
        details: [],
      };
    }
    case "unassigned-queue": {
      const display = w.params.label ?? w.params.queueId;
      return {
        message: `queue "${display}" is not assigned to any system`,
        details: [],
      };
    }
    case "unassigned-storage": {
      const display = w.params.label ?? w.params.storageId;
      return {
        message: `storage "${display}" is not assigned to any system`,
        details: [],
      };
    }
    case "unassigned-usecase":
      return {
        message: `usecase "${w.params.usecaseId}" is not assigned to any domain`,
        details: [],
      };
    case "style-conflict":
      return {
        message: `セレクタ "${w.params.selector}" が複数のスタイルファイルで定義されています`,
        details: w.params.sheetIndices.map((i) => `スタイルファイル ${i + 1}`),
      };
    case "missing-runtime":
      return {
        message: `デプロイノード "${w.params.nodeId}" に runtime が指定されていません`,
        details: [],
      };
    case "missing-realizes":
      return {
        message: `デプロイノード "${w.params.nodeId}" に realizes が指定されていません`,
        details: [],
      };
    case "unresolved-realizes":
      return {
        message: `デプロイノード "${w.params.deployNodeId}" の realizes "${w.params.target}" を解決できる service / domain が見つかりません`,
        details: [],
      };
    case "invalid-owns":
      return {
        message: `team "${w.params.teamId}" owns "${w.params.ownedId}" but no service or domain with that id exists`,
        details: [],
      };
    case "deprecated-team-property":
      return {
        message: `"${w.params.nodeId}" has explicit team property but team is already assigned via org.team.owns`,
        details: [
          `team assigned by owns: "${w.params.ownerTeamId}"`,
          'Remove the "team" property and use org { team { owns } } instead',
        ],
      };
    case "cross-system-ref-unresolved":
      return {
        message: `"${w.params.ref}" could not be resolved — rendered as unresolved external node`,
        details: [],
      };
    case "cross-system-ref-implicit-external":
      return {
        message: `"${w.params.ref}" is referenced from ${w.params.sourceSystemId}.${w.params.sourceNodeId} but not explicitly annotated as @external`,
        details: [
          `Add 'service ${w.params.targetSystemId} [external]' to system ${w.params.sourceSystemId} to suppress this warning`,
        ],
      };
    case "delivers-target-not-client":
      return {
        message: `service "${w.params.serviceId}" delivers target "${w.params.targetId}" is not a client node`,
        details: [],
      };
    case "legend-ref-unresolved":
      return {
        message: w.params.legendTitle
          ? `legend "${w.params.legendTitle}": ref ${w.params.target} does not match any node or style rule`
          : `legend ref ${w.params.target} does not match any node or style rule`,
        details: [],
      };
    case "cyclic-dependency": {
      const { cyclePath } = w.params;
      const joined =
        cyclePath.length === 2 && cyclePath[0] === cyclePath[1]
          ? `${cyclePath[0]} → ${cyclePath[0]}`
          : cyclePath.join(" → ");
      return {
        message: `Circular dependency detected: ${joined}`,
        details: [],
      };
    }
  }
}
