import type { ClientResource } from "../types/ast.js";
import { quoteId } from "./quote-id.js";
import { quoteString } from "./quote-string.js";

/**
 * A client's `resource <storageKind> [<Id>] "<name>"` line (#3794). The id is
 * quoted when no bare word can hold it, so it reads back as the same id
 * (TPL-2707).
 */
export function clientResourceLine(resource: ClientResource, indent: string): string {
  const id = resource.id !== undefined ? ` ${quoteId(resource.id)}` : "";
  return `${indent}resource ${resource.storageKind}${id} ${quoteString(resource.name)}`;
}
