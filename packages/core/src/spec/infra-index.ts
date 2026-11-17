/**
 * The declared physical universe: every `database` / `queue` / `storage` block
 * and the leaves (`table` / `queue-item` / `bucket`) declared inside it.
 *
 * One walk, because three consumers need the *same* answer and drifting copies
 * of "which physical things exist" is how a reference check and a report end up
 * disagreeing about the same model (TPL-1720):
 *
 * - `parser/reference-validation.ts` — does `resource Db.T` / `table Db.T` name
 *   something that exists (#2078)?
 * - `view/coverage-extract.ts` — how much of the declared physical layer did the
 *   logical model actually represent (#2078)?
 * - `view/crud-matrix-extract.ts` — one matrix column per leaf.
 *
 * Infra blocks reach the model through two routes — nested in a `system` (the
 * canonical form) and as a top-level bucket on `KrsFile` — and callers differ on
 * which roots they hold, so this takes a plain node array and walks whatever it
 * is given.
 *
 * Since #3794 a `<Parent>.<Child>` may also name a storage a `client` declares
 * with an id. {@link indexPhysicalTargets} indexes both kinds of target over the
 * whole model and {@link resolvePhysicalRef} is the one place that decides which
 * one a reference names, so no reader adds a third check of its own.
 */
import type {
  KrsNode,
  KrsFile,
  InfraKind,
  ClientNode,
  ClientResource,
  ClientResourceKind,
} from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";

export interface DeclaredInfraBlock {
  infraId: string;
  kind: InfraKind;
  /** Leaf ids declared inside the block, in declaration order. */
  leafIds: string[];
  /** Same ids as a set, for the membership tests reference checks make. */
  leaves: Set<string>;
  /** Leaf label fallback, keyed by leaf id (`label ?? id`). */
  leafLabels: Map<string, string>;
}

/**
 * Index every declared infra block reachable from `roots`, keyed by block id.
 *
 * A block id repeated across roots (S4.5 same-id infra reopen) unions its
 * leaves rather than replacing them: the merged model is what callers are
 * asking about, and dropping the first declaration's leaves here would make a
 * legitimately reopened `database` look like it lost tables.
 */
export function indexDeclaredInfra(roots: readonly KrsNode[]): Map<string, DeclaredInfraBlock> {
  const index = new Map<string, DeclaredInfraBlock>();

  const visit = (node: KrsNode): void => {
    if (INFRA_KIND_SET.has(node.kind)) {
      let entry = index.get(node.id);
      if (!entry) {
        entry = {
          infraId: node.id,
          kind: node.kind as InfraKind,
          leafIds: [],
          leaves: new Set(),
          leafLabels: new Map(),
        };
        index.set(node.id, entry);
      }
      for (const sub of node.children) {
        if (entry.leaves.has(sub.id)) continue;
        entry.leaves.add(sub.id);
        entry.leafIds.push(sub.id);
        entry.leafLabels.set(sub.id, sub.label ?? sub.id);
      }
      // Infra blocks do not nest, so there is nothing further down this branch.
      return;
    }
    for (const child of node.children) visit(child);
  };

  for (const root of roots) visit(root);
  return index;
}

/** Fully-qualified leaf key (`<infraId>.<leafId>`) — the table-granular identity. */
export function infraLeafKey(infraId: string, leafId: string): string {
  return `${infraId}.${leafId}`;
}

/**
 * One storage a `client` declares with an id (`resource <storageKind> <Id> "<name>"`),
 * the target a usecase's `resource <ClientId>.<Id>` resolves to (#3794).
 */
export interface DeclaredClientStorage {
  clientId: string;
  storageId: string;
  storageKind: ClientResourceKind;
  name: string;
  /** The declaration itself: its identity is what makes two copies of one import the same storage. */
  declaration: ClientResource;
}

/** Every declaration of one client id the model holds, as storage targets. */
export interface DeclaredClient {
  clientId: string;
  /**
   * Storage declarations by storage id. More than one entry means two client
   * nodes of this id (KRS018 / KRS030) each declare it, so a reference to it is
   * ambiguous. A duplicate inside one client node is not a second entry: the
   * first declaration wins and the rest are `client-resource-duplicate-id`.
   */
  storages: Map<string, DeclaredClientStorage[]>;
  /** Storages declared without an id, which nothing can reference (coverage reports them). */
  unidentified: ClientResource[];
}

/**
 * Where `<Parent>.<Child>` targets live: the infra blocks and the clients'
 * storages, built once over the whole model (TPL-1720, TPL-2088).
 */
export interface PhysicalTargetIndex {
  infra: Map<string, DeclaredInfraBlock>;
  /** Clients whose id no infra block shares, keyed by client id. */
  clients: Map<string, DeclaredClient>;
  /**
   * Client ids an infra block also uses. Such a reference resolves to the infra
   * block, as it did before clients were targets, and the client's storages are
   * left out of every index (`resource-target-ambiguous` names the clash).
   */
  shadowedClients: Set<string>;
}

/** Index every declared storage of every client reachable from `roots`. */
function indexDeclaredClients(roots: readonly KrsNode[]): Map<string, DeclaredClient> {
  const index = new Map<string, DeclaredClient>();
  // One client declaration reached through several import routes arrives as
  // copies that share their `properties`, so the storage objects are the same.
  const seen = new Set<ClientResource>();

  const visit = (node: KrsNode): void => {
    if (node.kind === "client") {
      const client = node as ClientNode;
      let entry = index.get(client.id);
      if (!entry) {
        entry = { clientId: client.id, storages: new Map(), unidentified: [] };
        index.set(client.id, entry);
      }
      const idsInThisNode = new Set<string>();
      for (const res of client.properties.resources ?? []) {
        if (seen.has(res)) continue;
        seen.add(res);
        if (res.id === undefined) {
          entry.unidentified.push(res);
          continue;
        }
        if (idsInThisNode.has(res.id)) continue;
        idsInThisNode.add(res.id);
        const storage: DeclaredClientStorage = {
          clientId: client.id,
          storageId: res.id,
          storageKind: res.storageKind,
          name: res.name,
          declaration: res,
        };
        const list = entry.storages.get(res.id);
        if (list) list.push(storage);
        else entry.storages.set(res.id, [storage]);
      }
      return;
    }
    for (const child of node.children) visit(child);
  };

  for (const root of roots) visit(root);
  return index;
}

/**
 * Index the targets of `<Parent>.<Child>` reachable from `roots`. Pass every
 * root of the model (systems, top-level services / clients / domains / infra
 * blocks): a client's storages are referenced from any domain, the way infra
 * leaves are.
 */
export function indexPhysicalTargets(roots: readonly KrsNode[]): PhysicalTargetIndex {
  const infra = indexDeclaredInfra(roots);
  const clients = indexDeclaredClients(roots);
  const shadowedClients = new Set<string>();
  for (const id of clients.keys()) {
    if (infra.has(id)) shadowedClients.add(id);
  }
  for (const id of shadowedClients) clients.delete(id);
  return { infra, clients, shadowedClients };
}

/** Every root of a parsed or merged file, in the order validation walks them. */
export function physicalTargetRoots(file: KrsFile): KrsNode[] {
  return [
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
}

/** What `<Parent>.<Child>` names. */
export type PhysicalRefTarget =
  | {
      kind: "infra";
      infraId: string;
      leafId: string;
      /** A client also has this id; its storages are not targets (`resource-target-ambiguous`). */
      shadowsClient: boolean;
    }
  | { kind: "client"; storage: DeclaredClientStorage }
  | {
      kind: "unresolved";
      /** No infra block or client has the parent id, or the parent has no such child. */
      missing: "block" | "leaf";
      /** Which kind of parent lacks the child; set when `missing` is `"leaf"`. */
      parentKind?: "infra" | "client";
      /** Set when the parent is an infra block a client also uses. */
      shadowsClient?: boolean;
      /** Set when more than one client node of the parent id declares the child. */
      ambiguous?: boolean;
    };

/**
 * Decide what `<Parent>.<Child>` names. The one place that answers "is this an
 * infra leaf, a client's storage, or nothing", read by validation, labels,
 * derived edges, the matrix, coverage and the LSP (TPL-1720).
 */
export function resolvePhysicalRef(
  index: PhysicalTargetIndex,
  parent: string,
  child: string,
): PhysicalRefTarget {
  const block = index.infra.get(parent);
  if (block) {
    const shadowsClient = index.shadowedClients.has(parent);
    if (block.leaves.has(child))
      return { kind: "infra", infraId: parent, leafId: child, shadowsClient };
    return { kind: "unresolved", missing: "leaf", parentKind: "infra", shadowsClient };
  }
  const client = index.clients.get(parent);
  if (client) {
    const candidates = client.storages.get(child);
    if (!candidates) return { kind: "unresolved", missing: "leaf", parentKind: "client" };
    if (candidates.length > 1) {
      return { kind: "unresolved", missing: "leaf", parentKind: "client", ambiguous: true };
    }
    return { kind: "client", storage: candidates[0] };
  }
  return { kind: "unresolved", missing: "block" };
}

/** The canvas / matrix label of a client storage: `<name> (<storageKind>)`. */
export function clientStorageLabel(
  storage: Pick<DeclaredClientStorage, "name" | "storageKind">,
): string {
  return `${storage.name} (${storage.storageKind})`;
}
