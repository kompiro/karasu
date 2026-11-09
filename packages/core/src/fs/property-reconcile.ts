import type { Diagnostic, KrsFile } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import { resolvePath } from "./path-utils.js";

type ReconciledProperty = "label" | "description";
type BlockKind = "system" | "deploy" | "organization";

/** A top-level block S3 reconciles across files: `system`, `deploy` or `organization`. */
interface ReconciledBlock {
  id: string;
  loc: SourceRange;
}

interface PendingConflict {
  blockId: string;
  blockKind: BlockKind;
  property: ReconciledProperty;
  values: Map<string, PropertyOrigin>;
  /** The merged block's final value. */
  read: () => string;
}

interface PropertyOrigin {
  /** Distance of the declaring file from the entry; unknown files sort last. */
  depth: number;
  loc: SourceRange;
}

/**
 * S3 / S4 of the syntax reference: when a `system`, `deploy` or `organization`
 * is reopened across files, its `label` / `description` come from the file
 * closest to the entry (`ImportResolver.resolve(entryPath)`).
 *
 * The resolver merges bottom-up, so a deeper file's value can reach a block
 * before a closer file's does. Deciding by merge order let a label two levels
 * down beat one a single level down (#3713). Here the distance travels with the
 * value: a value filled in from a deeper file keeps that file's distance, and a
 * conflict is decided by distance, with merge order (the earlier `import`) as
 * the tie-break. One instance per `resolve()`.
 */
export class PropertyReconciler {
  /** The file each top-level block was parsed from. */
  private blockFile = new WeakMap<object, string>();
  /** Each loaded file's shortest import distance from the entry. */
  private fileDepth = new Map<string, number>();
  /** Where a property's current value came from, once it is not the block's own. */
  private propertyOrigin = new WeakMap<object, Map<ReconciledProperty, PropertyOrigin>>();
  /** Every value each (block, property) was declared with, by the closest origin. */
  private conflicts = new Map<string, PendingConflict>();

  constructor(private readonly report: (diagnostic: Diagnostic) => void) {}

  /** Files every top-level `system` / `deploy` / `organization` of `file` under `filePath`. */
  recordBlocks(file: KrsFile, filePath: string): void {
    for (const block of [...file.systems, ...file.deploys, ...file.organizations]) {
      this.blockFile.set(block, filePath);
    }
  }

  /** A copy of `source` (a named-import stub) stands for the same declaration. */
  inherit(copy: object, source: object): void {
    const file = this.blockFile.get(source);
    if (file !== undefined) this.blockFile.set(copy, file);
    const origins = this.propertyOrigin.get(source);
    if (origins) this.propertyOrigin.set(copy, new Map(origins));
  }

  /**
   * Breadth-first distance from the entry to every loaded file, over the same
   * edges the merge follows (a directory import reaches each file Pass 1
   * expanded). The shortest path counts: a file reached both directly and
   * through another file is one step away.
   */
  measureFileDepths(
    fileMap: Map<string, KrsFile>,
    entryPath: string,
    dirExpansions: Map<string, string[]>,
  ): void {
    const depth = new Map<string, number>([[entryPath, 0]]);
    const queue = [entryPath];
    for (let i = 0; i < queue.length; i++) {
      const filePath = queue[i];
      const file = fileMap.get(filePath);
      if (!file) continue;
      const next = (depth.get(filePath) ?? 0) + 1;
      for (const nodeImport of file.nodeImports) {
        if (nodeImport.path === "") continue;
        const targets = nodeImport.path.endsWith("/")
          ? (dirExpansions.get(resolvePath(filePath, nodeImport.path)) ?? [])
          : [resolvePath(filePath, nodeImport.path)];
        for (const target of targets) {
          if (depth.has(target) || !fileMap.has(target)) continue;
          depth.set(target, next);
          queue.push(target);
        }
      }
    }
    this.fileDepth = depth;
  }

  reconcileLabel(
    target: ReconciledBlock & { label?: string },
    source: ReconciledBlock & { label?: string },
    blockKind: BlockKind,
  ): void {
    this.reconcile(
      target,
      source,
      blockKind,
      "label",
      (block) => block.label,
      (block, value) => {
        block.label = value;
      },
    );
  }

  reconcileDescription(
    target: ReconciledBlock & { properties: { description?: string } },
    source: ReconciledBlock & { properties: { description?: string } },
    blockKind: BlockKind,
  ): void {
    this.reconcile(
      target,
      source,
      blockKind,
      "description",
      (block) => block.properties.description,
      (block, value) => {
        block.properties.description = value;
      },
    );
  }

  /**
   * - `target` unset → take `source`'s value and its origin
   * - both set and different → the closer origin wins (ties keep `target`, the
   *   one merged first), and the conflict is kept for {@link reportConflicts}
   */
  private reconcile<B extends ReconciledBlock>(
    target: B,
    source: B,
    blockKind: BlockKind,
    property: ReconciledProperty,
    get: (block: B) => string | undefined,
    set: (block: B, value: string | undefined) => void,
  ): void {
    const t = get(target)?.trim() ?? "";
    const s = get(source)?.trim() ?? "";
    if (!s) return;
    const sourceOrigin = this.originOf(source, property);
    if (!t) {
      set(target, get(source));
      this.originsOf(target).set(property, sourceOrigin);
      return;
    }
    const targetOrigin = this.originOf(target, property);
    if (t === s) {
      // The same value declared closer: keep the closer origin, or a later,
      // farther conflicting value could beat it.
      if (sourceOrigin.depth < targetOrigin.depth)
        this.originsOf(target).set(property, sourceOrigin);
      return;
    }
    if (sourceOrigin.depth < targetOrigin.depth) {
      set(target, get(source));
      this.originsOf(target).set(property, sourceOrigin);
    }
    // Reported once the whole graph is merged: an intermediate file's verdict
    // can be reversed at the root, and a warning must name the final winner.
    const key = `${blockKind}\u0000${target.id}\u0000${property}`;
    let conflict = this.conflicts.get(key);
    if (!conflict) {
      conflict = { blockId: target.id, blockKind, property, values: new Map(), read: () => "" };
      this.conflicts.set(key, conflict);
    }
    // Bottom-up, so the last merge to touch the block is the root's.
    conflict.read = () => get(target)?.trim() ?? "";
    for (const [value, origin] of [
      [t, targetOrigin],
      [s, sourceOrigin],
    ] as const) {
      const known = conflict.values.get(value);
      if (!known || origin.depth < known.depth) conflict.values.set(value, origin);
    }
  }

  /**
   * One `system-property-conflict` per value that lost, naming the value the
   * merged model ended with and anchored on the losing declaration (the one to
   * edit). Call once, after the merge.
   */
  reportConflicts(): void {
    for (const { blockId, blockKind, property, values, read } of this.conflicts.values()) {
      const chosen = read();
      for (const [ignored, origin] of values) {
        if (ignored === chosen) continue;
        this.report({
          severity: "warning",
          code: "system-property-conflict",
          params: { blockId, blockKind, property, chosen, ignored },
          loc: origin.loc,
        });
      }
    }
    this.conflicts.clear();
  }

  private originOf(block: ReconciledBlock, property: ReconciledProperty): PropertyOrigin {
    const recorded = this.propertyOrigin.get(block)?.get(property);
    if (recorded) return recorded;
    const file = this.blockFile.get(block);
    const depth = file !== undefined ? this.fileDepth.get(file) : undefined;
    return { depth: depth ?? Number.POSITIVE_INFINITY, loc: block.loc };
  }

  private originsOf(block: object): Map<ReconciledProperty, PropertyOrigin> {
    let origins = this.propertyOrigin.get(block);
    if (!origins) {
      origins = new Map();
      this.propertyOrigin.set(block, origins);
    }
    return origins;
  }
}
