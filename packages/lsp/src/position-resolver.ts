import type { KrsFile, KrsNode, TeamNode } from "@karasu-tools/core";
import type { Range } from "vscode-languageserver/node";
import { toLspRange, type LspPosition } from "./lsp-position.js";

interface NodeEntry {
  id: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/** 1-based source position, matching core AST `SourceRange` points. */
interface AstPoint {
  line: number;
  column: number;
}

/** 1-based source range, matching core AST `SourceRange`. */
interface AstRange {
  start: AstPoint;
  end: AstPoint;
}

/**
 * The named-entity kinds `visitNamedEntities` walks. "krs" covers both
 * `systems` and `services` (KrsNode trees) — they share the identical
 * recursive shape and are visited identically.
 */
type NamedEntityGroup = "krs" | "deploy-block" | "deploy" | "org" | "team" | "member";

interface NamedEntity {
  id: string;
  loc: AstRange;
  /** Present only for entity kinds whose AST shape carries `properties.description`. */
  description?: string;
  group: NamedEntityGroup;
}

/**
 * Single traversal over every named entity in the KrsFile AST, encoding
 * TODAY's exact walk order and coverage. This replaces three previously
 * hand-rolled recursive walkers (`collectNodes`, `collectAllIdentifiers`,
 * `getNodeDescription`) that had already drifted from one another — see the
 * comments at each call site below for the specific drift each one
 * reproduces. `visitNamedEntities` itself must stay a literal merge of the
 * three prior traversals; it does not visit `clients` / `domains` /
 * `databases` / `queues` / `storages` / `boundaries` because none of the
 * three prior walkers did (out of scope for this refactor, see #2017).
 *
 * `stopDescending` reproduces `getNodeDescription`'s original stop-at-first-
 * match search: the three now-removed `search*` helpers returned as soon as
 * an id matched and never descended past that node (and, for a matched
 * `member`, bailed out of the rest of the enclosing team). `collectNodes`
 * and `collectAllIdentifiers` need the full traversal, so they pass no
 * predicate and every entity's subtree is visited. See `getNodeDescription`.
 */
function* visitNamedEntities(
  krsFile: KrsFile,
  stopDescending?: (entity: NamedEntity) => boolean,
): Generator<NamedEntity> {
  function* walkKrsNode(node: KrsNode): Generator<NamedEntity> {
    const entity: NamedEntity = {
      id: node.id,
      loc: node.loc,
      description: node.properties.description,
      group: "krs",
    };
    yield entity;
    // Original `searchKrsNode` returned at a matching node without recursing
    // into its children; reproduce by not descending here.
    if (stopDescending?.(entity)) return;
    for (const child of node.children) yield* walkKrsNode(child);
  }

  function* walkTeam(team: TeamNode): Generator<NamedEntity> {
    const teamEntity: NamedEntity = {
      id: team.id,
      loc: team.loc,
      description: team.properties.description,
      group: "team",
    };
    yield teamEntity;
    // Original `searchTeam` returned at a matching team without descending.
    if (stopDescending?.(teamEntity)) return;
    for (const child of team.children) {
      if (child.kind === "member") {
        const memberEntity: NamedEntity = {
          id: child.id,
          loc: child.loc,
          description: child.properties.description,
          group: "member",
        };
        yield memberEntity;
        // Original `searchTeam` returned *inline* at a matching member,
        // which stopped scanning the rest of THIS team's children (not just
        // the member's — members are leaves anyway). Bail out of the team.
        if (stopDescending?.(memberEntity)) return;
      } else {
        yield* walkTeam(child);
      }
    }
  }

  for (const sys of krsFile.systems) yield* walkKrsNode(sys);
  for (const svc of krsFile.services) yield* walkKrsNode(svc);
  for (const block of krsFile.deploys) {
    const blockEntity: NamedEntity = { id: block.id, loc: block.loc, group: "deploy-block" };
    yield blockEntity;
    if (stopDescending?.(blockEntity)) continue;
    for (const node of block.nodes) {
      yield { id: node.id, loc: node.loc, group: "deploy" };
    }
  }
  for (const org of krsFile.organizations) {
    const orgEntity: NamedEntity = {
      id: org.id,
      loc: org.loc,
      description: org.properties.description,
      group: "org",
    };
    yield orgEntity;
    // Original `searchOrg` returned at a matching org without visiting teams.
    if (stopDescending?.(orgEntity)) continue;
    for (const team of org.teams) yield* walkTeam(team);
  }
}

/**
 * Collect all named nodes from the KrsFile AST into a flat list.
 * AST positions are 1-based.
 */
export function collectNodes(krsFile: KrsFile): NodeEntry[] {
  const entries: NodeEntry[] = [];
  for (const entity of visitNamedEntities(krsFile)) {
    // DRIFT (reproduced, not fixed — see issue #2017 point 5): the
    // organization block's own id is excluded here even though
    // `collectAllIdentifiers` includes it below. This means
    // findNodeAtPosition/findRangeOfNode cannot resolve an org's own id,
    // only its teams/members — a pre-existing inconsistency, not a
    // regression introduced by this refactor.
    if (entity.group === "org") continue;
    entries.push({ id: entity.id, start: entity.loc.start, end: entity.loc.end });
  }
  return entries;
}

/**
 * Given an LSP position (0-based), find the innermost node that contains it.
 * Returns the node ID, or null if no node covers the position.
 */
export function findNodeAtPosition(krsFile: KrsFile, position: LspPosition): string | null {
  // Convert LSP 0-based to AST 1-based
  const astLine = position.line + 1;
  const astCol = position.character + 1;

  const entries = collectNodes(krsFile);
  let best: NodeEntry | null = null;

  for (const entry of entries) {
    if (!containsPosition(entry, astLine, astCol)) continue;
    // Prefer the entry that starts latest (innermost node)
    if (
      best === null ||
      entry.start.line > best.start.line ||
      (entry.start.line === best.start.line && entry.start.column > best.start.column)
    ) {
      best = entry;
    }
  }
  return best ? best.id : null;
}

function containsPosition(entry: NodeEntry, astLine: number, astCol: number): boolean {
  const { start, end } = entry;
  if (astLine < start.line || astLine > end.line) return false;
  if (astLine === start.line && astCol < start.column) return false;
  if (astLine === end.line && astCol > end.column) return false;
  return true;
}

/**
 * Given a node ID, find its source range in the AST.
 * Returns an LSP Range (0-based), or null if not found.
 */
export function findRangeOfNode(krsFile: KrsFile, nodeId: string): Range | null {
  const entries = collectNodes(krsFile);
  const entry = entries.find((e) => e.id === nodeId);
  if (!entry) return null;

  return toLspRange(entry);
}

// ─── Phase 5 helpers ─────────────────────────────────────────────────────────

/**
 * Collect all defined node IDs from the KrsFile, including top-level services
 * (which collectNodes omits because they appear in krsFile.services, not as
 * children of systems).
 */
export function collectAllIdentifiers(krsFile: KrsFile): string[] {
  const ids: string[] = [];
  // Unfiltered: unlike `collectNodes`, this includes the organization
  // block's own id (group "org") — this asymmetry is the drift documented
  // on `collectNodes` above.
  for (const entity of visitNamedEntities(krsFile)) ids.push(entity.id);
  return ids;
}

/**
 * Find the description of a node by its ID.
 * Returns null if the node has no description or is not found.
 */
export function getNodeDescription(krsFile: KrsFile, nodeId: string): string | null {
  // Continue-on-null: the original `search*` helpers propagated `null` up
  // through their parent loops, so when the first entity matching `nodeId`
  // had no description the search kept going and could return a LATER
  // duplicate-id entity's description (duplicate ids are common mid-edit).
  // Reproduce that here by scanning matches in traversal order and returning
  // the first one that actually carries a description (`!= null` so an
  // empty-string description still counts, matching `description ?? null`),
  // returning null only if no matching entity has one. The `stopDescending`
  // argument reproduces the original stop-at-match pruning so the SAME
  // entity wins the tie (see visitNamedEntities) — without it, a matched
  // node's same-id descendant, or a later same-team child after a matched
  // member, could wrongly win.
  for (const entity of visitNamedEntities(krsFile, (e) => e.id === nodeId)) {
    // DRIFT (reproduced, not fixed — see issue #2017 point 5): deploy
    // blocks and deploy nodes are skipped entirely here, so this never
    // resolves a description for them even though `collectNodes`/
    // `collectAllIdentifiers` both include deploy entities. Skipping them
    // (rather than just relying on their `description` being absent) also
    // preserves the original search order: an id shared between a deploy
    // entity and a later system/service/org entity still resolves to the
    // later entity's description, exactly as the original per-container
    // loops (which never visited `krsFile.deploys` at all) did.
    if (entity.group === "deploy-block" || entity.group === "deploy") continue;
    if (entity.id !== nodeId) continue;
    if (entity.description != null) return entity.description;
  }
  return null;
}

/**
 * Extract the identifier-like word ([\w] characters) around the given position.
 */
export function getWordAtPosition(text: string, position: LspPosition): string | null {
  const lines = text.split("\n");
  const line = lines[position.line];
  if (!line) return null;

  const char = position.character;
  // Return null if cursor is not on a word character
  if (char >= line.length || !/\w/.test(line[char])) return null;

  let start = char;
  let end = char;

  while (start > 0 && /\w/.test(line[start - 1])) start--;
  while (end < line.length && /\w/.test(line[end])) end++;

  return start < end ? line.slice(start, end) : null;
}
