/**
 * Temporary compat bridge: reproduces the pre-Phase-B `message` string from
 * a structured `Diagnostic`. Exists so app / CLI / LSP consumers don't
 * regress during the i18n rollout (see `docs/design/i18n-support.md`
 * Phase B → Phase D).
 *
 * Each branch intentionally outputs the same string that the producer used
 * to write inline. Once diagnostics are wired into `useTranslation`
 * (Phase D), this file can be deleted.
 *
 * @deprecated Replaced by `useTranslation()` in Phase D. Do not add new
 *   callers — new consumers should read `d.code` / `d.params` directly.
 */

import type { Diagnostic } from "../types/ast.js";

export function formatDiagnostic(d: Diagnostic): string {
  switch (d.code) {
    // ── Token / parse structure ─────────────────────────────────────────
    case "token-type-mismatch":
      return `Expected ${d.params.expected} but got ${d.params.got} ("${d.params.value}")`;
    case "unexpected-token-root":
      return `Unexpected token: ${d.params.tokenType} ("${d.params.value}")`;
    case "unexpected-token-in-block": {
      const { blockKind, tokenType, value } = d.params;
      if (blockKind === "sub-resource") {
        return `Unexpected token in sub-resource block: ${tokenType} ("${value}"). Sub-resource nodes (table, queue-item, bucket) cannot contain child declarations.`;
      }
      // Empty blockKind is the generic "Unexpected token in block" path (the
      // original message had no context qualifier).
      if (blockKind === "") {
        return `Unexpected token in block: ${tokenType} ("${value}")`;
      }
      // "deploy node" is already a noun phrase — original message did not
      // append "block" after it. All other block kinds do get the "block"
      // suffix so the classic wording is preserved.
      if (blockKind === "deploy node") {
        return `Unexpected token in deploy node: ${tokenType} ("${value}")`;
      }
      return `Unexpected token in ${blockKind} block: ${tokenType} ("${value}")`;
    }
    case "expected-brace-or-string":
      return `Expected { or string literal but got ${d.params.got} ("${d.params.value}")`;
    case "expected-identifier":
      return `Expected identifier but got ${d.params.got} ("${d.params.value}")`;
    case "expected-string-after":
      return `Expected string literal after "${d.params.property}"`;
    case "property-not-for-node-kind":
      switch (d.params.property) {
        case "role":
          return `"role" property is only valid for user nodes`;
        case "team":
          return `"team" property is only valid for service and domain nodes`;
        case "handles":
          return `"handles" property is only valid for client and service nodes`;
        default: {
          const exhaustive: never = d.params.property;
          throw new Error(`unhandled property-not-for-node-kind variant: ${String(exhaustive)}`);
        }
      }
    case "infra-not-in-context":
      return `"${d.params.infraKind}" is only valid as a direct child of system, not inside "${d.params.parentKind}"`;
    case "expected-id-or-string":
      return `Expected identifier or string literal after "${d.params.context}"`;
    case "expected-node-id":
      return `Expected identifier or string literal (id) after "${d.params.kind}"`;
    case "invalid-node-kind":
      return `Unexpected logical node kind: "${d.params.kind}"`;
    case "expected-property-value":
      return `Expected value for property "${d.params.propName}"`;
    case "expected-id-after":
      return `Expected identifier or string literal after "${d.params.property}"`;

    // ── Parser semantic diagnostics ─────────────────────────────────────
    case "team-property-deprecated":
      return `"team" property is deprecated; use an organization block with "owns" instead`;
    case "edge-source-mismatch":
      return `Edge source "${d.params.from}" must match the enclosing block id "${d.params.parentId}"`;
    case "unassigned-resource":
      return `resource "${d.params.resourceId}" is not assigned to any database`;
    case "client-resource-invalid-kind":
      return `Invalid client resource kind "${d.params.kind}" for resource "${d.params.name}". Allowed kinds: localStorage, sessionStorage, indexedDB, opfs, file, keychain`;
    case "duplicate-owner-assignment":
      return `"${d.params.nodeId}" is already owned by team "${d.params.existingTeam}"; multiple teams cannot own the same service or domain`;
    case "duplicate-team-id":
      return `Duplicate team id "${d.params.teamId}"`;
    case "domain-id-not-unique":
      return `Domain id "${d.params.domainId}" must be unique within a system; found in multiple services`;
    case "node-id-multiple-locations":
      return `Node id "${d.params.nodeId}" appears in multiple locations; first path is used for navigation`;
    case "duplicate-node-id-parent":
      return `Duplicate node id "${d.params.nodeId}" under the same parent`;
    case "owns-target-not-found":
      return `"${d.params.ownedId}" referenced in "owns" was not found in the system hierarchy`;

    // ── Style parser ────────────────────────────────────────────────────
    case "style-token-type-mismatch":
      return `Expected ${d.params.expected} but got ${d.params.got} ("${d.params.value}")`;
    case "expected-style-property-name":
      return `Expected property name but got ${d.params.got}`;

    // ── Import resolver ─────────────────────────────────────────────────
    case "circular-import":
      return `Circular import detected: ${d.params.filePath}`;
    case "file-not-found":
      return `File not found: ${d.params.filePath}`;
    case "directory-not-found":
      return `Directory not found: ${d.params.dirPath}`;
    case "service-outside-system":
      return `"${d.params.serviceId}" is declared outside any system block — system membership is ambiguous`;
    case "duplicate-node-in-system":
      return `Duplicate node ID "${d.params.nodeId}" in system "${d.params.systemId}"`;
    case "duplicate-node-in-deploy":
      return `Duplicate node ID "${d.params.nodeId}" in deploy block "${d.params.deployId}"`;
    case "duplicate-team-in-organization":
      return `Duplicate team ID "${d.params.teamId}" in organization "${d.params.orgId}"`;
    case "import-id-not-found":
      return `Imported identifier "${d.params.id}" not found in ${d.params.path}`;
    case "circular-style-import":
      return `Circular style import detected: ${d.params.filePath}`;
    case "style-file-not-found":
      return `Style file not found: ${d.params.filePath}`;

    // ── App-level synthetic diagnostics ────────────────────────────────
    case "app-project-compile-error":
      return "プロジェクトのコンパイル中にエラーが発生しました";
    case "app-org-parse-error":
      return "パース中にエラーが発生しました";
    case "generic-text":
      return d.params.text;
  }
}
