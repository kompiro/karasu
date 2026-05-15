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
        case "delivers":
          return `"delivers" property is only valid for service nodes`;
        case "operations":
          return `"operations" property is only valid for resource declarations inside a usecase`;
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
    case "unknown-resource-operation":
      return `Unknown resource operation "${d.params.operation}" on "${d.params.resourceId}". Recognized verbs: create, read, update, delete`;
    case "duplicate-resource-operation":
      return `Duplicate resource operation "${d.params.operation}" on "${d.params.resourceId}"`;
    case "invalid-crud-decoration":
      return `Invalid CRUD decoration "${d.params.value}" on operation "${d.params.operation}" of resource "${d.params.resourceId}". Right-hand side must be one of: create, read, update, delete`;
    case "empty-crud-decoration":
      return `Empty CRUD decoration on operation "${d.params.operation}" of resource "${d.params.resourceId}". Use "${d.params.operation}:create,read,update,delete" or drop the colon`;
    case "duplicate-crud-decoration-target":
      return `Duplicate CRUD verb "${d.params.value}" in decoration of "${d.params.operation}" on resource "${d.params.resourceId}"`;
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
    case "duplicate-edge-id":
      return `Duplicate edge id "#${d.params.authorId}"; edge ids must be unique within a system`;
    case "ambiguous-edge-base":
      return `Multiple edges share the base "${d.params.fromId}${d.params.arrow}${d.params.toId}" with no #<id> to disambiguate; per-edge style selectors will not match any of them`;

    // ── Style parser ────────────────────────────────────────────────────
    case "style-token-type-mismatch":
      return `Expected ${d.params.expected} but got ${d.params.got} ("${d.params.value}")`;
    case "expected-style-property-name":
      return `Expected property name but got ${d.params.got}`;
    case "expected-semicolon-between-properties":
      return `Expected ";" after property "${d.params.property}" but found ","; properties are separated by semicolons`;

    // ── Style value validator (Phase 3) ─────────────────────────────────
    case "style-invalid-enum-value":
      return `Invalid value for "${d.params.property}": "${d.params.value}". Allowed: ${d.params.allowed.join(", ")}`;
    case "style-invalid-hex-color":
      return `Invalid hex color for "${d.params.property}": "${d.params.value}" (expected #RGB / #RGBA / #RRGGBB / #RRGGBBAA)`;
    case "style-missing-length-unit":
      return `Missing unit for "${d.params.property}": "${d.params.value}". Expected one of: ${d.params.allowedUnits.join(", ")}`;
    case "style-invalid-length-unit":
      return `Invalid unit "${d.params.unit}" for "${d.params.property}": "${d.params.value}". Allowed: ${d.params.allowedUnits.join(", ")}`;
    case "style-out-of-range": {
      const range = formatRange(d.params.min, d.params.max);
      return `Value ${d.params.value} for "${d.params.property}" is out of range ${range}`;
    }
    case "style-unknown-property":
      return `Unknown style property "${d.params.property}"`;

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
    case "system-property-conflict": {
      const { blockKind, blockId, property, chosen, ignored } = d.params;
      return `${blockKind} "${blockId}" ${property} conflict — using "${chosen}", ignoring "${ignored}"`;
    }
    case "infra-redeclared-across-files": {
      const { blockKind, blockId } = d.params;
      return `${blockKind} "${blockId}" is declared in multiple files; karasu merged them.`;
    }
    case "infra-leaf-redeclared-silently": {
      const { leafKind, leafId, infraKind, infraId } = d.params;
      return `${leafKind} "${leafId}" is declared more than once inside ${infraKind} "${infraId}"; karasu kept the first declaration.`;
    }
    case "import-id-not-found":
      return `Imported identifier "${d.params.id}" not found in ${d.params.path}`;
    case "import-path-not-found": {
      const { path, failedAt, importPath, lastResolvedId } = d.params;
      const pathStr = path.join(".");
      const segment = path[failedAt] ?? "";
      if (lastResolvedId !== undefined) {
        return `Import path "${pathStr}" failed at segment "${segment}" (#${failedAt}): no child with that id under "${lastResolvedId}"`;
      }
      return `Import path "${pathStr}" failed at segment "${segment}" (#${failedAt}): no top-level system with that id in ${importPath}`;
    }
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

function formatRange(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `[${min}, ${max}]`;
  if (min !== undefined) return `>= ${min}`;
  if (max !== undefined) return `<= ${max}`;
  return "";
}
