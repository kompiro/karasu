import type { KrsNode, ResourceNode, ClientResource, ClientResourceKind } from "../types/ast.js";
import {
  infraLeafKey,
  physicalTargetRoots,
  resolvePhysicalRef,
  type PhysicalTargetIndex,
} from "../spec/infra-index.js";
import { buildEntityResolver } from "../resolver/resource-entity.js";
import type { KrsFile } from "../types/ast.js";

/** A client's storage line as the detail panel shows it (#3794). */
export type ClientStorageEntry = ClientResource & {
  /** Labels of the usecases whose `resource <ClientId>.<Id>` resolves to it. */
  usecases?: string[];
};

/** The client storage a promoted `resource <ClientId>.<Id>` node names (#3794). */
export interface ClientStorageTarget {
  clientId: string;
  storageId: string;
  storageKind: ClientResourceKind;
  name: string;
}

/** What node metadata needs to describe client storages: built once per compile. */
export interface ClientStorageContext {
  targets: PhysicalTargetIndex;
  /** Usecase labels per `<ClientId>.<Id>`, in model order. */
  usecasesByStorage: Map<string, string[]>;
}

export function buildClientStorageContext(
  file: KrsFile,
  targets: PhysicalTargetIndex,
): ClientStorageContext {
  const roots = physicalTargetRoots(file);
  const resolver = buildEntityResolver(roots, targets);
  const usecasesByStorage = new Map<string, string[]>();
  const walk = (node: KrsNode): void => {
    if (node.kind === "usecase") {
      for (const child of node.children) {
        if (child.kind !== "resource") continue;
        const storage = resolver.resolve(child as ResourceNode).clientStorage;
        if (!storage) continue;
        const key = infraLeafKey(storage.clientId, storage.storageId);
        const list = usecasesByStorage.get(key) ?? [];
        const label = node.label ?? node.id;
        if (!list.includes(label)) list.push(label);
        usecasesByStorage.set(key, list);
      }
    }
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return { targets, usecasesByStorage };
}

/**
 * The client-storage fields of a node's metadata: a client's storage lines
 * with the usecases that reference each, or the storage a promoted resource
 * node names. Empty for every other node.
 */
export function clientStorageMetadata(
  node: KrsNode,
  ctx: ClientStorageContext | undefined,
): { resources?: ClientStorageEntry[]; clientStorage?: ClientStorageTarget } {
  if (node.kind === "client") {
    if (node.properties.resources.length === 0) return {};
    // Only the first storage of an id is what a reference resolves to; a later
    // duplicate (`client-resource-duplicate-id`) is used by nobody.
    const seen = new Set<string>();
    return {
      resources: node.properties.resources.map((res) => {
        const first = res.id !== undefined && !seen.has(res.id);
        if (res.id !== undefined) seen.add(res.id);
        const usecases =
          first && res.id !== undefined && ctx?.targets.clients.has(node.id)
            ? ctx.usecasesByStorage.get(infraLeafKey(node.id, res.id))
            : undefined;
        return usecases ? { ...res, usecases: [...usecases] } : { ...res };
      }),
    };
  }
  const ref = node.kind === "resource" ? (node as ResourceNode).ref : undefined;
  if (!ref || !ctx) return {};
  const target = resolvePhysicalRef(ctx.targets, ref.parent, ref.child);
  if (target.kind !== "client") return {};
  const { clientId, storageId, storageKind, name } = target.storage;
  return { clientStorage: { clientId, storageId, storageKind, name } };
}
