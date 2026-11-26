import type { SourceRange } from "./tokens.js";

// The storage and capability lines a `client` declares (ADR-823, ADR-837),
// kept apart from `ast.ts` so it stays inside its line budget. Re-exported from
// there, so importers keep reading them from `ast.ts`.

/**
 * Storage kinds whitelisted for `client { resource <kind> [<Id>] "<name>" }`.
 * Cookie / credential storage and device capabilities are intentionally
 * excluded — see Issues #834 / #837.
 */
export const CLIENT_RESOURCE_KINDS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "opfs",
  "file",
  "keychain",
] as const;

export type ClientResourceKind = (typeof CLIENT_RESOURCE_KINDS)[number];

export interface ClientResource {
  storageKind: ClientResourceKind;
  /**
   * Optional id (`resource <storageKind> <Id> "<name>"`): what a usecase's
   * `resource <ClientId>.<Id>` resolves to (#3794). A storage without one
   * cannot be referenced.
   */
  id?: string;
  name: string;
  loc: SourceRange;
}

/**
 * Device / browser capability declared on a client (camera, geolocation,
 * notification, etc.). Identifier set is intentionally open — see
 * ADR-837. Recommended names live in
 * `docs/spec/tags-annotations.md`.
 */
export interface ClientCapability {
  name: string;
  label?: string;
  description?: string;
  loc: SourceRange;
}
