import type { DatabaseNode, QueueGroupNode, StorageNode } from "../types/ast.js";

/** A top-level or system-level infra block: the nodes S4.5 reopens across files. */
export type InfraNode = DatabaseNode | QueueGroupNode | StorageNode;
type InfraField = keyof InfraNode;

/**
 * How a field of a reopened infra block is merged (spec S4.5):
 *
 * - `identity`: what makes two declarations the same block; equal by construction.
 * - `root-wins`: the block the merge lands on keeps its value, silently. Body
 *   properties are root-entry-wins without a warning, unlike S3 (TPL-1385).
 * - `union`: both declarations contribute.
 */
export type InfraMergeRule = "identity" | "root-wins" | "union";

/**
 * Every field of an infra block, with its rule. `satisfies` over the node's own
 * keys makes a field added to the node fail to compile until it is classified,
 * and the resolver's merge takes the `union` fields from here, so a field marked
 * `union` cannot be left out of it (#2754 merged the leaves and dropped the edges).
 */
export const INFRA_MERGE_POLICY = {
  id: "identity",
  kind: "identity",
  loc: "root-wins",
  label: "root-wins",
  tags: "root-wins",
  annotations: "root-wins",
  annotationParams: "root-wins",
  properties: "root-wins",
  // Membership in a facet travels with the declaration the merge keeps.
  facets: "root-wins",
  children: "union",
  edges: "union",
  boundaries: "union",
} as const satisfies Record<InfraField, InfraMergeRule>;

export type InfraUnionField = {
  [K in InfraField]: (typeof INFRA_MERGE_POLICY)[K] extends "union" ? K : never;
}[InfraField];

/** The fields both declarations of a reopened infra block contribute to. */
export const INFRA_UNION_FIELDS = (Object.keys(INFRA_MERGE_POLICY) as InfraField[]).filter(
  (field): field is InfraUnionField => INFRA_MERGE_POLICY[field] === "union",
);
