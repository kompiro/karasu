import { TokenType, type Token } from "../types/tokens.js";
import type { TokenCursor } from "./kebab-name.js";
import type { NodeIdPath } from "../types/ast.js";

/**
 * Shared machinery for node references written as dotted paths (#2547,
 * slice A of #2088).
 *
 * Every site that accepts `A.B.C` (import entries, cross-system edge
 * endpoints, cross-domain entity relations, `resource OrderDB.Orders`, the
 * entity `table` mapping) reads the token run through `readNodeIdPathTail`
 * so the sites cannot drift apart lexically (TPL-2088). Like
 * `kebab-name.ts`, this module sees the parser only through the minimal
 * `TokenCursor` view and emits no diagnostics — each call site keeps its
 * own error codes and recovery, which differ deliberately (see the
 * `dangling` contract below).
 *
 * The suffix rule (`nodePathMatchesSuffix` / `resolveNodePathBySuffix`)
 * defines what a path *means*: a reference matches a node when it equals
 * the tail of that node's full path, a bare id being the length-1 case.
 * Existing sites keep their site-specific resolvers; slices B/C (#2548,
 * #2549) resolve through these helpers.
 */

/** Result of reading the dotted tail of a node-reference path. */
export interface NodeIdPathTail {
  /** Segment values actually read: `first.value` plus each accepted tail segment. */
  segments: NodeIdPath;
  /** Last accepted segment token (for building source ranges). */
  end: Token;
  /**
   * Set when a consumed `.` was not followed by a valid segment token: the
   * offending token, deliberately NOT consumed. The caller decides how to
   * report and whether to skip it — recovery differs per site and is part
   * of each site's observable behavior.
   */
  dangling?: Token;
}

export interface ReadNodeIdPathTailOptions {
  /** Maximum number of segments to read, including `first`. Default: unlimited. */
  maxSegments?: number;
  /** Accept `StringLiteral` tokens as tail segments (default: identifiers only). */
  acceptStringSegments?: boolean;
}

/**
 * Read the `(Dot segment)*` tail of a node-reference path whose first
 * segment token has already been consumed by the caller (the same calling
 * convention as `stitchKebabTail`). A `.` is consumed only while the
 * segment budget allows; if the token after a consumed `.` is not a valid
 * segment, reading stops and that token is returned as `dangling`,
 * unconsumed.
 */
export function readNodeIdPathTail(
  first: Token,
  cursor: TokenCursor,
  opts?: ReadNodeIdPathTailOptions,
): NodeIdPathTail {
  const maxSegments = opts?.maxSegments ?? Number.POSITIVE_INFINITY;
  const acceptStringSegments = opts?.acceptStringSegments ?? false;
  const segments: NodeIdPath = [first.value];
  let end = first;
  while (segments.length < maxSegments && cursor.peek().type === TokenType.Dot) {
    cursor.advance(); // consume "."
    const next = cursor.peek();
    const isSegment =
      next.type === TokenType.Identifier ||
      (acceptStringSegments && next.type === TokenType.StringLiteral);
    if (!isSegment) {
      return { segments, end, dangling: next };
    }
    cursor.advance();
    segments.push(next.value);
    end = next;
  }
  return { segments, end };
}

/**
 * A reference matches a node when it equals the tail of that node's full
 * path. A bare id is the length-1 case.
 */
export function nodePathMatchesSuffix(
  ref: readonly string[],
  fullPath: readonly string[],
): boolean {
  if (ref.length === 0 || ref.length > fullPath.length) {
    return false;
  }
  const offset = fullPath.length - ref.length;
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] !== fullPath[offset + i]) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve a reference against a candidate set by the suffix rule,
 * returning every match in candidate order. Works over any candidate shape
 * that carries a `path` (reference-validation's `DeclaredNodePath` &c.).
 */
export function resolveNodePathBySuffix<T extends { path: NodeIdPath }>(
  ref: readonly string[],
  candidates: Iterable<T>,
): T[] {
  const matches: T[] = [];
  for (const candidate of candidates) {
    if (nodePathMatchesSuffix(ref, candidate.path)) {
      matches.push(candidate);
    }
  }
  return matches;
}

/**
 * Canonical string key for a full node path, used by the path-keyed indices
 * (`ownerIndex`, `boundaryMembership`).
 *
 * A dotted join is not injective for quoted ids that themselves contain a
 * dot — the same caveat the renderer's qualified ids (`Sys.Svc`) and deep
 * permalinks already carry. JSON keying (like `boundaryScopeKey`) would be
 * injective but would break consumers that already hold a dotted qualified
 * id as their node key, so the renderer's existing convention wins.
 */
export function nodePathKey(segments: readonly string[]): string {
  return segments.join(".");
}

/** A resolved match that knows the kind of the node it points at. */
export interface KindedPathCandidate {
  kind: string;
  path: NodeIdPath;
}

/**
 * Decide whether a multi-match is ambiguous (#2088): report only when the
 * matches are NOT uniform in `(kind, depth)`. Uniform multi-matches are the
 * parallel-modelling patterns ADR-927 / ADR-1566 legitimize (migration
 * coexistence, multi-tenant, a generic domain name across systems), where
 * broadcast is the intent and renaming is not an available remedy.
 *
 * Returns the candidates when ambiguous, `undefined` otherwise. Order
 * independent by construction: the verdict is a set-size test.
 */
export function ambiguousNodePathCandidates<T extends KindedPathCandidate>(
  matches: readonly T[],
): T[] | undefined {
  if (matches.length < 2) {
    return undefined;
  }
  const keys = new Set(matches.map((m) => `${m.kind}:${m.path.length}`));
  return keys.size > 1 ? [...matches] : undefined;
}
