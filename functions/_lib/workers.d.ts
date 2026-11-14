/**
 * The one Workers runtime global the Functions use that the DOM lib lacks
 * (`[[path]].ts`): the zone's default cache. Declared here instead of pulling in
 * `@cloudflare/workers-types` for one property.
 */
interface CacheStorage {
  readonly default: Cache;
}
