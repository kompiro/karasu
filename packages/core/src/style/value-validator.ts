import type { Diagnostic } from "../types/ast.js";
import type { StyleSheet, ValueNode } from "../types/style.js";
import { hasShape } from "../shapes/shape-registry.js";
// The built-in icon set registers itself on import, so `hasShape` answers the
// same on every surface — including the LSP, which never draws (#2802).
import "../shapes/builtin-icons.js";
import { isKnownProperty, PROPERTY_SCHEMAS, type ValueSpec } from "./property-schema.js";

export interface ValidateStyleValuesOptions {
  /**
   * Whether a `url("<name>")` argument names a registered shape. Defaults to
   * the process-wide shape registry (`hasShape`), which core fills with its
   * built-in icons on import; injectable so tests need not touch that
   * registry, and so an embedder that registers its own icons *after*
   * validating can still answer for them.
   */
  isRegisteredShape?: (name: string) => boolean;
}

/**
 * Walk every rule in `sheet`, look up the schema for each declared
 * property, and emit `Diagnostic`s for any value that does not match.
 *
 * Returns parser-level `Diagnostic` objects so callers can merge them
 * with the parse diagnostics that `StyleParser.parse` already produces.
 *
 * Properties absent from `PROPERTY_SCHEMAS` produce a single
 * `style-unknown-property` warning per occurrence; the validator then
 * skips the value (no enum / hex check is attempted).
 *
 * A structurally valid `url("<name>")` whose name no registered icon
 * answers to produces a `style-unknown-icon` warning (#2802): the renderer
 * draws such a node as a `box`, and before this warning a typo in the name
 * was accepted silently on every surface (TPL-1503).
 */
export function validateStyleValues(
  sheet: StyleSheet,
  options: ValidateStyleValuesOptions = {},
): Diagnostic[] {
  const isRegisteredShape = options.isRegisteredShape ?? hasShape;
  const out: Diagnostic[] = [];
  for (const rule of sheet.rules) {
    const valueNodes = rule.valueNodes;
    if (!valueNodes) continue;
    for (const property of Object.keys(rule.properties)) {
      const declLoc = rule.declarationLocs[property];
      if (!isKnownProperty(property)) {
        out.push({
          severity: "warning",
          code: "style-unknown-property",
          params: { property },
          ...(declLoc ? { loc: declLoc } : {}),
        });
        continue;
      }
      const node = valueNodes[property];
      if (!node) continue; // value classification failed in parser; skip
      const schema = PROPERTY_SCHEMAS[property];
      const diags: Diagnostic[] = [];
      validateAgainstSpec(node, schema, property, diags);
      if (diags.length === 0) {
        // Structure passed; now the one check that reads outside the sheet.
        const unknownIcon = unregisteredUrlName(node, schema, isRegisteredShape);
        if (unknownIcon !== undefined) {
          diags.push({
            severity: "warning",
            code: "style-unknown-icon",
            params: { property, name: unknownIcon },
          });
        }
      }
      // Use the value node's loc when available (more precise than the
      // whole declaration); fall back to the declaration loc.
      for (const d of diags) {
        out.push({ ...d, loc: node.loc ?? declLoc });
      }
    }
  }
  return out;
}

/**
 * Whether a declaration's value satisfies its property's schema. A property
 * the schema does not know is kept: it is forward-compatible and the resolver
 * ignores what it does not read. `flattenSheetsInCascadeOrder` drops a
 * declaration this rejects, so the resolver never sees a value the validator
 * reports (#3141).
 */
export function satisfiesPropertySchema(property: string, node: ValueNode): boolean {
  if (!isKnownProperty(property)) return true;
  return collectMismatch(node, PROPERTY_SCHEMAS[property], property).length === 0;
}

/**
 * Match `node` against `spec` and append any diagnostics to `out`.
 * Walks the spec union recursively. The `union` case tries each branch
 * and only emits a diagnostic if every branch fails (using the most
 * specific failure as the message).
 */
function validateAgainstSpec(
  node: ValueNode,
  spec: ValueSpec,
  property: string,
  out: Diagnostic[],
): void {
  const branchDiagnostics = collectMismatch(node, spec, property);
  for (const d of branchDiagnostics) out.push(d);
}

/**
 * Returns the diagnostics for `node` against `spec` (empty array on
 * match, one or more diagnostics on mismatch). Pure — does not push to
 * an external array, so the union case can collect candidate failures
 * from each branch and pick the right ones.
 */
function collectMismatch(node: ValueNode, spec: ValueSpec, property: string): Diagnostic[] {
  switch (spec.kind) {
    case "any":
      return [];
    case "ident-of":
      if (node.kind === "ident" && spec.values.includes(node.value)) return [];
      return [
        {
          severity: "error",
          code: "style-invalid-enum-value",
          params: {
            property,
            value: stringifyValueNode(node),
            allowed: [...spec.values],
          },
        },
      ];
    case "hex":
      if (node.kind === "hex" && isValidHex(node.value)) return [];
      return [
        {
          severity: "error",
          code: "style-invalid-hex-color",
          params: { property, value: stringifyValueNode(node) },
        },
      ];
    case "number":
      if (node.kind !== "number") {
        return [
          {
            severity: "error",
            code: "style-invalid-enum-value",
            params: { property, value: stringifyValueNode(node), allowed: ["<number>"] },
          },
        ];
      }
      if (spec.integer && !Number.isInteger(node.value)) {
        return [
          {
            severity: "error",
            code: "style-invalid-enum-value",
            params: { property, value: stringifyValueNode(node), allowed: ["<integer>"] },
          },
        ];
      }
      if (
        (spec.min !== undefined && node.value < spec.min) ||
        (spec.max !== undefined && node.value > spec.max)
      ) {
        return [
          {
            severity: "error",
            code: "style-out-of-range",
            params: {
              property,
              value: node.value,
              ...(spec.min !== undefined ? { min: spec.min } : {}),
              ...(spec.max !== undefined ? { max: spec.max } : {}),
            },
          },
        ];
      }
      return [];
    case "length":
      if (node.kind === "number") {
        return [
          {
            severity: "error",
            code: "style-missing-length-unit",
            params: {
              property,
              value: stringifyValueNode(node),
              allowedUnits: [...spec.allowedUnits],
            },
          },
        ];
      }
      if (node.kind !== "length") {
        return [
          {
            severity: "error",
            code: "style-invalid-enum-value",
            params: {
              property,
              value: stringifyValueNode(node),
              allowed: spec.allowedUnits.map((u) => `<number>${u}`),
            },
          },
        ];
      }
      if (!spec.allowedUnits.includes(node.unit)) {
        return [
          {
            severity: "error",
            code: "style-invalid-length-unit",
            params: {
              property,
              value: stringifyValueNode(node),
              unit: node.unit,
              allowedUnits: [...spec.allowedUnits],
            },
          },
        ];
      }
      if (spec.min !== undefined && node.value < spec.min) {
        return [
          {
            severity: "error",
            code: "style-out-of-range",
            params: { property, value: node.value, min: spec.min },
          },
        ];
      }
      return [];
    case "string":
      if (node.kind === "string") return [];
      return [
        {
          severity: "error",
          code: "style-invalid-enum-value",
          params: {
            property,
            value: stringifyValueNode(node),
            allowed: ["<string>"],
          },
        },
      ];
    case "url":
      if (node.kind === "function" && node.name === "url") return [];
      return [
        {
          severity: "error",
          code: "style-invalid-enum-value",
          params: {
            property,
            value: stringifyValueNode(node),
            allowed: ["url(...)"],
          },
        },
      ];
    case "list-of":
      if (node.kind !== "list") {
        // Single value still acceptable as a one-item list.
        return collectMismatch(node, spec.item, property);
      }
      for (const item of node.items) {
        const itemDiags = collectMismatch(item, spec.item, property);
        if (itemDiags.length > 0) return itemDiags;
      }
      return [];
    case "union": {
      // Try each branch. If any matches, the whole union matches with
      // no diagnostics. Otherwise report one branch's failure: a number
      // goes to the branch that reads numbers, so `label-position: -0.5`
      // says it is out of `[0, 1]` rather than that it is not
      // `start / middle / end` (#3141); anything else gets the first
      // branch's. Keywords keep the first branch on purpose: for `color`
      // that is the hex message, where the keyword branch would list
      // every CSS named color.
      let firstFailure: Diagnostic[] | null = null;
      let numericFailure: Diagnostic[] | null = null;
      for (const branch of spec.specs) {
        const branchDiags = collectMismatch(node, branch, property);
        if (branchDiags.length === 0) return [];
        if (firstFailure === null) firstFailure = branchDiags;
        if (numericFailure === null && node.kind === "number" && readsNumbers(branch)) {
          numericFailure = branchDiags;
        }
      }
      return numericFailure ?? firstFailure ?? [];
    }
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unhandled ValueSpec kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * The `url()` argument of `node` when the schema accepts a `url` and no
 * registered shape answers to that name; `undefined` otherwise. The name is
 * `argRaw` — what the author wrote inside the parens, quotes stripped by the
 * parser — which is also exactly what the style resolver looks up, so this
 * warning fires precisely when the renderer would fall back to `box`.
 */
function unregisteredUrlName(
  node: ValueNode,
  spec: ValueSpec,
  isRegisteredShape: (name: string) => boolean,
): string | undefined {
  if (node.kind !== "function" || node.name !== "url") return undefined;
  if (!specAcceptsUrl(spec)) return undefined;
  return isRegisteredShape(node.argRaw) ? undefined : node.argRaw;
}

function readsNumbers(spec: ValueSpec): boolean {
  return spec.kind === "number" || spec.kind === "length";
}

function specAcceptsUrl(spec: ValueSpec): boolean {
  switch (spec.kind) {
    case "url":
      return true;
    case "union":
      return spec.specs.some(specAcceptsUrl);
    case "list-of":
      return specAcceptsUrl(spec.item);
    default:
      return false;
  }
}

function isValidHex(value: string): boolean {
  // # + 3, 4, 6, or 8 hex digits.
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

/**
 * Render a `ValueNode` back to its source-equivalent string for use in
 * diagnostic messages. Faithful reconstruction is not required — the
 * goal is "show the user what they wrote so they can find it".
 */
function stringifyValueNode(node: ValueNode): string {
  switch (node.kind) {
    case "ident":
      return node.value;
    case "hex":
      return node.value;
    case "number":
      return node.raw;
    case "length":
      return `${node.raw}${node.unit}`;
    case "string":
      return `"${node.value}"`;
    case "function":
      return `${node.name}("${node.argRaw}")`;
    case "list":
      return node.items.map(stringifyValueNode).join(", ");
    default: {
      const _exhaustive: never = node;
      return JSON.stringify(_exhaustive);
    }
  }
}
